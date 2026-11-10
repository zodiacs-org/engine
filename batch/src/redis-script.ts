/** Bounds one atomic expiration sweep and the Lua argument stack for HSET. */
export const REDIS_QUEUE_MAX_PENDING = 1024;

/**
 * Internal Redis protocol. The client validates job definitions and result rows;
 * this script owns backend time and atomic lease, cursor and retry transitions.
 * All fields live in KEYS[1]. Specs and rows remain opaque JSON strings.
 *
 * Redis scripts do not roll back writes on a later Lua error. Every mutation
 * therefore stages its complete HSET and response before issuing the only write.
 */
export const REDIS_QUEUE_SCRIPT = String.raw`
local key = KEYS[1]
local operation = ARGV[1]
local null = cjson.null
local MAX_SAFE = 9007199254740991
local MAX_PENDING = ${REDIS_QUEUE_MAX_PENDING}
local array_marker = {}
local queue_error = {}
local writes = {}

local function fail(code)
  error({marker = queue_error, code = code}, 0)
end

local function integer(value, minimum, maximum, code)
  if type(value) ~= 'number' or value ~= value or value < minimum
    or value > (maximum or MAX_SAFE) or value ~= math.floor(value) then
    fail(code or 'storage-failure')
  end
  return value
end

local function text(value)
  if type(value) ~= 'string' or #value == 0 then fail('storage-failure') end
  return value
end

local function array(value)
  return setmetatable(value or {}, array_marker)
end

-- Redis cjson's numeric precision is insufficient for safe JS integers.
-- Only metadata is encoded here; spec and result numbers never pass through Lua.
local function encode(value)
  if value == null then return 'null' end
  local kind = type(value)
  if kind == 'string' then return cjson.encode(value) end
  if kind == 'boolean' then return value and 'true' or 'false' end
  if kind == 'number' then
    integer(value, 0)
    return string.format('%.17g', value)
  end
  if kind ~= 'table' then fail('storage-failure') end
  local parts = {}
  if getmetatable(value) == array_marker then
    for index = 1, #value do parts[index] = encode(value[index]) end
    return '[' .. table.concat(parts, ',') .. ']'
  end
  for name, item in pairs(value) do
    if type(name) ~= 'string' then fail('storage-failure') end
    parts[#parts + 1] = cjson.encode(name) .. ':' .. encode(item)
  end
  return '{' .. table.concat(parts, ',') .. '}'
end

local function decode(value)
  if type(value) ~= 'string' then fail('storage-failure') end
  local valid, decoded = pcall(cjson.decode, value)
  if not valid or type(decoded) ~= 'table' then fail('storage-failure') end
  return decoded
end

local function fields(value, allowed)
  if type(value) ~= 'table' then fail('storage-failure') end
  for name in pairs(value) do
    if not allowed[name] then fail('storage-failure') end
  end
end

local function nullable_integer(value)
  if value ~= null then integer(value, 0) end
end

local function read_record(id)
  local raw = redis.call('HGET', key, 'job:' .. id)
  if not raw then return nil end
  local record = decode(raw)
  fields(record, {snapshot = true, token = true})
  local snapshot = record.snapshot
  fields(snapshot, {
    id = true, kind = true, status = true, totalTasks = true,
    completedTasks = true, nextCursor = true, claimCount = true, retry = true,
    failureCount = true, retryAt = true, lastFailure = true, createdAt = true,
    updatedAt = true, finishedAt = true, lease = true
  })
  if snapshot.id ~= id or (snapshot.kind ~= 'charts' and snapshot.kind ~= 'transit-grid'
    and snapshot.kind ~= 'synastry-matrix') then fail('storage-failure') end
  if snapshot.status ~= 'queued' and snapshot.status ~= 'running'
    and snapshot.status ~= 'completed' and snapshot.status ~= 'failed' then fail('storage-failure') end
  integer(snapshot.totalTasks, 1)
  integer(snapshot.completedTasks, 0, snapshot.totalTasks)
  if snapshot.nextCursor ~= snapshot.completedTasks then fail('storage-failure') end
  integer(snapshot.claimCount, 0)
  fields(snapshot.retry, {maxAttempts = true, delayMs = true})
  integer(snapshot.retry.maxAttempts, 1, 100)
  integer(snapshot.retry.delayMs, 0, 86400000)
  integer(snapshot.failureCount, 0, snapshot.retry.maxAttempts)
  nullable_integer(snapshot.retryAt)
  integer(snapshot.createdAt, 0)
  integer(snapshot.updatedAt, 0)
  nullable_integer(snapshot.finishedAt)
  if snapshot.lastFailure ~= null then
    fields(snapshot.lastFailure, {code = true, at = true, cursor = true})
    if snapshot.lastFailure.code ~= 'execution-failed' and snapshot.lastFailure.code ~= 'lease-expired' then
      fail('storage-failure')
    end
    integer(snapshot.lastFailure.at, 0)
    integer(snapshot.lastFailure.cursor, 0, snapshot.nextCursor)
  end
  if snapshot.status == 'running' then
    fields(snapshot.lease, {owner = true, expiresAt = true})
    local owner = text(snapshot.lease.owner)
    if #owner > 80 or not string.match(owner, '^[A-Za-z0-9][A-Za-z0-9._:-]*$') then
      fail('storage-failure')
    end
    integer(snapshot.lease.expiresAt, 0)
    text(record.token)
  elseif snapshot.lease ~= null or record.token ~= null then
    fail('storage-failure')
  end
  local terminal = snapshot.status == 'completed' or snapshot.status == 'failed'
  if terminal ~= (snapshot.finishedAt ~= null) then fail('storage-failure') end
  if (snapshot.status == 'completed') ~= (snapshot.nextCursor == snapshot.totalTasks) then
    fail('storage-failure')
  end
  if (snapshot.status == 'failed') ~= (snapshot.failureCount == snapshot.retry.maxAttempts) then
    fail('storage-failure')
  end
  if snapshot.status ~= 'queued' and snapshot.retryAt ~= null then fail('storage-failure') end
  if (snapshot.failureCount == 0) ~= (snapshot.lastFailure == null) then fail('storage-failure') end
  return record
end

local function read_pending(initialized)
  if not initialized then return array() end
  local encoded = redis.call('HGET', key, 'pending')
  local pending = decode(encoded)
  if not string.match(encoded, '^%s*%[') then fail('storage-failure') end
  if #pending > MAX_PENDING then fail('storage-failure') end
  local seen = {}
  for index, id in pairs(pending) do
    integer(index, 1, #pending)
    text(id)
    if seen[id] then fail('storage-failure') end
    seen[id] = true
  end
  return array(pending)
end

local function stage(name, value)
  writes[#writes + 1] = name
  writes[#writes + 1] = value
end

local function stage_record(record)
  stage('job:' .. record.snapshot.id, encode(record))
end

local function remove_pending(id)
  local pending = read_pending(true)
  local retained = array()
  local found = false
  for _, candidate in ipairs(pending) do
    if candidate == id then found = true else retained[#retained + 1] = candidate end
  end
  if not found then fail('storage-failure') end
  stage('pending', encode(retained))
end

local function time()
  local clock = redis.call('TIME')
  local seconds = integer(tonumber(clock[1]), 0, nil, 'invalid-argument')
  local micros = integer(tonumber(clock[2]), 0, 999999, 'invalid-argument')
  return integer(seconds * 1000 + math.floor(micros / 1000), 0, nil, 'invalid-argument')
end

local function deadline(now, duration)
  integer(duration, 1, nil, 'invalid-argument')
  -- Subtraction checks the boundary before addition can round an overflow.
  if duration > MAX_SAFE - now then fail('invalid-argument') end
  return now + duration
end

local function active(id, token, now)
  local record = read_record(id)
  if not record or record.snapshot.status ~= 'running' or record.token ~= token
    or now >= record.snapshot.lease.expiresAt then fail('lease-lost') end
  return record
end

local function lease(record)
  return {
    jobId = record.snapshot.id, token = record.token,
    owner = record.snapshot.lease.owner, expiresAt = record.snapshot.lease.expiresAt
  }
end

local function prepared(record)
  local encoded = redis.call('HGET', key, 'spec:' .. record.snapshot.id)
  text(encoded)
  return {snapshot = record.snapshot, lease = lease(record), encoded = encoded}
end

local function failure(record, code, at, now)
  local snapshot = record.snapshot
  local count = snapshot.failureCount + 1
  local exhausted = count >= snapshot.retry.maxAttempts
  snapshot.status = exhausted and 'failed' or 'queued'
  snapshot.failureCount = count
  snapshot.lastFailure = {code = code, at = at, cursor = snapshot.nextCursor}
  snapshot.retryAt = exhausted and null or at + math.min(snapshot.retry.delayMs, MAX_SAFE - at)
  snapshot.finishedAt = exhausted and at or null
  snapshot.lease = null
  snapshot.updatedAt = now
  record.token = null
end

local function run()
  local stored_type = redis.call('TYPE', key)
  if type(stored_type) == 'table' then stored_type = stored_type.ok end
  if stored_type ~= 'none' and stored_type ~= 'hash' then fail('unsupported-schema') end
  local initialized = stored_type == 'hash'
  if initialized and redis.call('HGET', key, 'schema') ~= '1' then fail('unsupported-schema') end

  if operation == 'submit' then
    local id, encoded, kind = ARGV[2], ARGV[3], ARGV[4]
    local total = tonumber(ARGV[5])
    local attempts, delay = tonumber(ARGV[6]), tonumber(ARGV[7])
    local idempotency = ARGV[8]
    if idempotency ~= '' then
      local previous_id = redis.call('HGET', key, 'key:' .. idempotency)
      if previous_id then
        local previous = read_record(previous_id)
        if not previous then fail('storage-failure') end
        local previous_spec = redis.call('HGET', key, 'spec:' .. previous_id)
        text(previous_spec)
        if previous_spec ~= encoded or previous.snapshot.retry.maxAttempts ~= attempts
          or previous.snapshot.retry.delayMs ~= delay then fail('idempotency-conflict') end
        return previous.snapshot
      end
    end
    if redis.call('HGET', key, 'job:' .. id) then fail('storage-failure') end
    local now = time()
    local pending = read_pending(initialized)
    if #pending >= MAX_PENDING then fail('storage-busy') end
    local snapshot = {
      id = id, kind = kind, status = 'queued', totalTasks = total,
      completedTasks = 0, nextCursor = 0, claimCount = 0,
      retry = {maxAttempts = attempts, delayMs = delay}, failureCount = 0,
      retryAt = null, lastFailure = null, createdAt = now, updatedAt = now,
      finishedAt = null, lease = null
    }
    stage_record({snapshot = snapshot, token = null})
    stage('spec:' .. id, encoded)
    if idempotency ~= '' then stage('key:' .. idempotency, id) end
    pending[#pending + 1] = id
    stage('pending', encode(pending))
    if not initialized then stage('schema', '1') end
    return snapshot
  end

  if operation == 'get' then
    local record = read_record(ARGV[2])
    return record and record.snapshot or null
  end

  if operation == 'page' then
    local id = ARGV[2]
    local record = read_record(id)
    if not record then return null end
    local cursor = integer(tonumber(ARGV[3]), 0, record.snapshot.nextCursor, 'invalid-argument')
    local limit = integer(tonumber(ARGV[4]), 1, 128, 'invalid-argument')
    local finish = cursor + math.min(limit, record.snapshot.nextCursor - cursor)
    local rows = array()
    for index = cursor, finish - 1 do
      rows[#rows + 1] = text(redis.call('HGET', key, 'row:' .. id .. ':' .. string.format('%.17g', index)))
    end
    return {snapshot = record.snapshot, rows = rows, nextCursor = finish}
  end

  if operation == 'claim' then
    local now = time()
    local expires_at = deadline(now, tonumber(ARGV[4]))
    local pending = read_pending(initialized)
    local retained = array()
    local changed = false
    local candidate = nil
    for _, id in ipairs(pending) do
      local record = read_record(id)
      if not record then fail('storage-failure') end
      local snapshot = record.snapshot
      if snapshot.status == 'running' and now >= snapshot.lease.expiresAt then
        failure(record, 'lease-expired', snapshot.lease.expiresAt, now)
        stage_record(record)
      end
      if snapshot.status == 'queued' or snapshot.status == 'running' then
        retained[#retained + 1] = id
        if not candidate and snapshot.status == 'queued'
          and (snapshot.retryAt == null or now >= snapshot.retryAt) then candidate = record end
      else
        changed = true
      end
    end
    if changed then stage('pending', encode(retained)) end
    if not candidate then return null end
    local snapshot = candidate.snapshot
    if snapshot.claimCount == MAX_SAFE then fail('invalid-argument') end
    snapshot.claimCount = snapshot.claimCount + 1
    snapshot.status = 'running'
    snapshot.retryAt = null
    snapshot.updatedAt = now
    snapshot.lease = {owner = ARGV[3], expiresAt = expires_at}
    candidate.token = ARGV[2]
    local response = prepared(candidate)
    stage_record(candidate)
    return response
  end

  if operation == 'prepareCommit' then
    return prepared(active(ARGV[2], ARGV[3], time()))
  end

  if operation == 'renew' then
    local now = time()
    local expires_at = deadline(now, tonumber(ARGV[4]))
    local record = active(ARGV[2], ARGV[3], now)
    record.snapshot.lease.expiresAt = math.max(record.snapshot.lease.expiresAt, expires_at)
    record.snapshot.updatedAt = now
    stage_record(record)
    return lease(record)
  end

  if operation == 'commit' then
    local now = time()
    local record = active(ARGV[2], ARGV[3], now)
    local snapshot = record.snapshot
    local cursor = tonumber(ARGV[4])
    if cursor ~= snapshot.nextCursor then fail('cursor-conflict') end
    local count = #ARGV - 4
    if count < 1 or count > 128 or count > snapshot.totalTasks - cursor then fail('invalid-result') end
    for index = 1, count do
      local row_index = cursor + index - 1
      stage('row:' .. snapshot.id .. ':' .. string.format('%.17g', row_index), ARGV[index + 4])
    end
    snapshot.nextCursor = cursor + count
    snapshot.completedTasks = snapshot.nextCursor
    snapshot.updatedAt = now
    if snapshot.nextCursor == snapshot.totalTasks then
      snapshot.status = 'completed'
      snapshot.finishedAt = now
      snapshot.lease = null
      record.token = null
      remove_pending(snapshot.id)
    end
    stage_record(record)
    return snapshot
  end

  if operation == 'release' or operation == 'fail' then
    local now = time()
    local record = active(ARGV[2], ARGV[3], now)
    local snapshot = record.snapshot
    if operation == 'fail' then
      failure(record, 'execution-failed', now, now)
      if snapshot.status == 'failed' then remove_pending(snapshot.id) end
    else
      snapshot.status = 'queued'
      snapshot.lease = null
      snapshot.retryAt = null
      snapshot.updatedAt = now
      record.token = null
    end
    stage_record(record)
    return snapshot
  end

  fail('invalid-argument')
end

local succeeded, response = pcall(run)
if not succeeded then
  if type(response) == 'table' and response.marker == queue_error then
    return encode({error = response.code})
  end
  error(response, 0)
end

-- Encode before the write: even response serialization failure changes nothing.
local encoded_response = encode({ok = response})
if #writes > 0 then redis.call('HSET', key, unpack(writes)) end
return encoded_response
`;
