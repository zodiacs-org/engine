#!/usr/bin/env bash
# Run a command in a mount namespace without the machine's root-owned /node_modules, with the Node of
# NODE_BIN first on PATH and TMPDIR outside any checkout (the archive-binding check and the packed-consumer
# check refuse a node_modules above their temporary directory).
#   NODE_BIN=/abs/node-v22.22.2-linux-x64/bin ns.sh <command> [arguments]
: "${NODE_BIN:?set NODE_BIN to the bin directory of the Node to use}"
args=""
for d in /*; do case $d in /node_modules|/proc|/dev|/tmp) ;; *) args="$args --bind $d $d";; esac; done
mkdir -p /tmp/rc11brk/tmp
exec bwrap $args --proc /proc --dev /dev --bind /tmp /tmp env TMPDIR=/tmp/rc11brk/tmp PATH=$NODE_BIN:/usr/bin:/bin "$@"
