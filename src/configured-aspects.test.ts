import { describe, expect, it } from "vitest";
import { ASPECTS, findAspects } from "./aspects.js";
import { natalChart } from "./api.js";
import {
  CONFIGURED_ASPECT_ANGLES,
  DEFAULT_ASPECT_POLICY,
  createAspectPolicy,
  findConfiguredAspects
} from "./configured-aspects.js";
import type { AspectPolicyInput, AspectPosition, ConfiguredAspect, ConfiguredAspectMotion } from "./configured-aspects.js";
import { abs, cmp, isRoundedHalfEven, sub } from "./fixtures/rational.js";
import type { BodyPosition } from "./types.js";

const position = (body: string, lon: number, speed = 1): AspectPosition => ({body,lon,speed});
const pair = (aLongitude: number, bLongitude: number, aSpeed = 1, bSpeed = 0) => [position("A",aLongitude,aSpeed),position("B",bLongitude,bSpeed)];
function policy(options: AspectPolicyInput = {}) {
  return createAspectPolicy({bodies:["A","B"],aspects:[{type:"conjunction",orb:8}],...options});
}
const semanticFields = ({a,b,type,applying}: Pick<ConfiguredAspect,"a"|"b"|"type"|"applying">) => ({a,b,type,applying});
/** Each orb is the exact |separation − angle| of the input doubles, rounded once, and within its limit. */
function expectBoundedOrbs(aspects: readonly ConfiguredAspect[], bodies: readonly AspectPosition[]) {
  for (const aspect of aspects) {
    const a=bodies.find(body=>body.body===aspect.a)!;
    const b=bodies.find(body=>body.body===aspect.b)!;
    const difference=abs(sub(a.lon,b.lon));
    const distance=cmp(difference,180)>0?sub(360,difference):difference;
    expect(isRoundedHalfEven(aspect.orb,abs(sub(distance,aspect.angle)))).toBe(true);
    expect(aspect.orb).toBeLessThanOrEqual(aspect.maximumOrb);
  }
}

describe("policy resolution and ownership", () => {
  it("resolves named minor angles without prescribing their orbs", () => {
    const expected = {semisextile:30,semisquare:45,quintile:72,sesquiquadrate:135,biquintile:144,quincunx:150};
    for (const [type,angle] of Object.entries(expected)) {
      const configured = policy({aspects:[{type,orb:1}]});
      const result = findConfiguredAspects(pair(0,angle),configured);
      expect(result.aspects).toHaveLength(1);
      expect(result.aspects[0]).toMatchObject({type,angle,orb:0,motion:"separating",maximumOrb:1});
    }
  });

  it("snapshots caller data, freezes every policy/result layer and records conventions", () => {
    const source = {bodies:["A","B"],aspects:[{type:"custom",angle:40,orb:{applying:2,separating:1,stationary:0.5}}],bodyOrbs:{A:{applying:1.5,separating:0.75,stationary:0.25}}};
    const configured = createAspectPolicy(source);
    source.bodies[0]="Changed"; source.aspects[0]!.angle=41; source.aspects[0]!.orb.applying=3; source.bodyOrbs.A.applying=3;
    expect(configured.bodies).toEqual(["A","B"]);
    expect(configured.aspects[0]).toMatchObject({angle:40,orb:{applying:2}});
    expect(configured.bodyOrbs.A?.applying).toBe(1.5);
    const result = findConfiguredAspects(pair(0,40.5),configured);
    expect(result.policy).toBe(configured);
    for(const value of [configured,configured.bodies,configured.aspects,configured.aspects[0],configured.aspects[0]!.orb,configured.bodyOrbs,configured.bodyOrbs.A,configured.conventions,result,result.aspects,result.aspects[0],CONFIGURED_ASPECT_ANGLES,DEFAULT_ASPECT_POLICY]) expect(Object.isFrozen(value)).toBe(true);
    expect(JSON.parse(JSON.stringify(result)).policy.conventions.orb).toContain("both-body-caps");
    expect(() => { (configured.bodies as string[]).push("C"); }).toThrow();
    expect(() => { (configured.aspects[0]!.orb as {applying:number}).applying=99; }).toThrow();
  });

  it("does not share the ASPECTS definitions, which are frozen from 1.0.0", () => {
    // That the policy does not consult them either, whatever they hold, is
    // src/configured-aspects-isolation.test.ts: they can no longer be changed here.
    const legacy = ASPECTS[0] as unknown as {orb:number};
    expect(()=>{legacy.orb=0;}).toThrow(TypeError);
    const configured=createAspectPolicy();
    expect(configured.aspects[0]?.orb.applying).toBe(8);
    expect(configured.aspects[0]).not.toBe(ASPECTS[0]);
    expect(findConfiguredAspects([position("Mars",0),position("Saturn",5)],configured).aspects).toHaveLength(1);
  });

  it("supports empty explicit selections and exact case-sensitive labels", () => {
    expect(findConfiguredAspects(pair(0,0),policy({aspects:[]})).aspects).toEqual([]);
    expect(findConfiguredAspects(pair(0,0),policy({bodies:[]})).aspects).toEqual([]);
    expect(findConfiguredAspects([position("A",0),position("b",0)],policy()).aspects).toEqual([]);
    const selected=policy({bodies:["North Node","Ascendant"],aspects:[{type:"square",orb:1}]});
    expect(findConfiguredAspects([position("North Node",0,-0.05),position("Ascendant",90,360)],selected).aspects[0]?.type).toBe("square");
  });
});

describe("orb resolution and matching", () => {
  it.each([0.1,0.3,360/7,179.9])("keeps exact custom angle %s at zero orb in either row order", angle => {
    const configured=policy({aspects:[{type:"custom",angle,orb:0}]});
    for (const speed of [-1,0,1]) {
      const positions=pair(angle,0,speed);
      for (const rows of [positions,[...positions].reverse()]) {
        const result=findConfiguredAspects(rows,configured).aspects;
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({angle,orb:0,maximumOrb:0,motion:speed===0?"stationary":"separating"});
      }
    }
    const outside=angle+Number.EPSILON*Math.max(1,angle);
    expect(outside).toBeGreaterThan(angle);
    expect(findConfiguredAspects(pair(outside,0),configured).aspects).toEqual([]);
    expect(findConfiguredAspects(pair(outside,0).reverse(),configured).aspects).toEqual([]);
  });

  it("preserves decimal inclusive limits, just-outside rejection, motion and row reversal", () => {
    const configured=policy({aspects:[{type:"conjunction",orb:{applying:0.1,separating:0,stationary:0}}]});
    for (const rows of [pair(0.1,0,-1),pair(0.1,0,-1).reverse()]) {
      expect(findConfiguredAspects(rows,configured).aspects[0]).toMatchObject({orb:0.1,maximumOrb:0.1,motion:"applying"});
    }
    for (const rows of [pair(0.10000000000000002,0,-1),pair(0.1,0,1),pair(0.1,0,0)]) {
      expect(findConfiguredAspects(rows,configured).aspects).toEqual([]);
      expect(findConfiguredAspects([...rows].reverse(),configured).aspects).toEqual([]);
    }
  });

  it("does not collapse small positive separations and folds a wrapped boundary consistently", () => {
    const zero=policy({aspects:[{type:"conjunction",orb:0}]});
    const tiny=policy({aspects:[{type:"conjunction",orb:{applying:1e-14,separating:0,stationary:0}}]});
    for (const rows of [pair(1e-14,0,-1),pair(1e-14,0,-1).reverse()]) {
      expect(findConfiguredAspects(rows,zero).aspects).toEqual([]);
      expect(findConfiguredAspects(rows,tiny).aspects[0]).toMatchObject({orb:1e-14,motion:"applying"});
    }
    const wrapped=policy({aspects:[{type:"conjunction",orb:{applying:0.125,separating:0,stationary:0}}]});
    for (const rows of [pair(359.875,0,1),pair(359.875,0,1).reverse()]) {
      expect(findConfiguredAspects(rows,wrapped).aspects[0]).toMatchObject({orb:0.125,motion:"applying"});
    }
    expect(findConfiguredAspects(pair(359.875,0,-1),wrapped).aspects).toEqual([]);
    expect(findConfiguredAspects(pair(359.87499999999994,0,1),wrapped).aspects).toEqual([]);
  });

  it("does not round a just-outside default boundary into an eligible aspect", () => {
    const at=[position("Mars",97),position("Saturn",0,0)];
    const outside=[position("Mars",97.00000000000001),position("Saturn",0,0)];
    expect(findConfiguredAspects(at,DEFAULT_ASPECT_POLICY).aspects[0]).toMatchObject({type:"square",orb:7});
    expect(findConfiguredAspects([...at].reverse(),DEFAULT_ASPECT_POLICY).aspects[0]).toMatchObject({type:"square",orb:7});
    expect(findConfiguredAspects(outside,DEFAULT_ASPECT_POLICY).aspects).toEqual([]);
    expect(findConfiguredAspects([...outside].reverse(),DEFAULT_ASPECT_POLICY).aspects).toEqual([]);
    // Across 0°, with b ≠ 0: the exact separation is 8 + 2^-50, just outside the 8° conjunction.
    const wrappedOutside=[position("Mars",7.6999999999999895),position("Saturn",359.7,0)];
    expect(findConfiguredAspects(wrappedOutside,DEFAULT_ASPECT_POLICY).aspects).toEqual([]);
    expect(findConfiguredAspects([...wrappedOutside].reverse(),DEFAULT_ASPECT_POLICY).aspects).toEqual([]);
    // One ulp lower, 7.699999999999989 is exactly 8° from 359.7: included at the inclusive limit.
    const wrappedAt=[position("Mars",359.7-352),position("Saturn",359.7,0)];
    expect(wrappedAt[0]!.lon).toBe(7.699999999999989);
    expect(findConfiguredAspects(wrappedAt,DEFAULT_ASPECT_POLICY).aspects[0]).toMatchObject({type:"conjunction",orb:8,maximumOrb:8});
    expect(findConfiguredAspects([...wrappedAt].reverse(),DEFAULT_ASPECT_POLICY).aspects[0]).toMatchObject({type:"conjunction",orb:8});
  });

  it("uses separate applying, separating and stationary limits, including exact boundaries", () => {
    const configured=policy({aspects:[{type:"square",orb:{applying:2,separating:1,stationary:0.5}}]});
    expect(findConfiguredAspects(pair(88,0,1),configured).aspects[0]).toMatchObject({motion:"applying",orb:2,maximumOrb:2});
    expect(findConfiguredAspects(pair(88,0,-1),configured).aspects).toHaveLength(0);
    expect(findConfiguredAspects(pair(91,0,1),configured).aspects[0]).toMatchObject({motion:"separating",orb:1,maximumOrb:1});
    expect(findConfiguredAspects(pair(90.5,0,1,1),configured).aspects[0]).toMatchObject({motion:"stationary",orb:0.5,maximumOrb:0.5,applying:false});
    expect(findConfiguredAspects(pair(90.5001,0,1,1),configured).aspects).toHaveLength(0);
  });

  it("applies luminary replacement first, then both body caps as symmetric upper limits", () => {
    const configured=createAspectPolicy({bodies:["Sun","Mars"],aspects:[{type:"conjunction",orb:8,luminaryOrb:10}],bodyOrbs:{Sun:4,Mars:{applying:3,separating:2,stationary:1}}});
    const positions=[position("Sun",0,0),position("Mars",2,-1)];
    expect(findConfiguredAspects(positions,configured).aspects[0]).toMatchObject({orb:2,motion:"applying",maximumOrb:3});
    expect(findConfiguredAspects([...positions].reverse(),configured).aspects[0]).toMatchObject({orb:2,motion:"applying",maximumOrb:3});
    expect(findConfiguredAspects([position("Sun",0,0),position("Mars",3.1,-1)],configured).aspects).toHaveLength(0);
    const widened=createAspectPolicy({bodies:["Sun","Mars"],aspects:[{type:"conjunction",orb:2,luminaryOrb:5}]});
    expect(findConfiguredAspects([position("Sun",0),position("Mars",4)],widened).aspects[0]?.maximumOrb).toBe(5);
  });

  it("chooses closest eligible absolute orb, then definition order; eligibility precedes ranking", () => {
    const configured=policy({aspects:[{type:"low",angle:60,orb:10},{type:"high",angle:80,orb:10}]});
    expect(findConfiguredAspects(pair(70,0),configured).aspects[0]?.type).toBe("low");
    expect(findConfiguredAspects(pair(71,0),configured).aspects[0]?.type).toBe("high");
    const cap=policy({aspects:[{type:"near",angle:70,orb:0.25},{type:"far",angle:72,orb:2}]});
    expect(findConfiguredAspects(pair(70.5,0),cap).aspects[0]?.type).toBe("far");
    const sameAngle=policy({aspects:[{type:"first",angle:70,orb:1},{type:"second",angle:70,orb:1}]});
    expect(findConfiguredAspects(pair(70,0),sameAngle).aspects).toHaveLength(1);
    expect(findConfiguredAspects(pair(70,0),sameAngle).aspects[0]?.type).toBe("first");
  });

  it("sorts by orb and retains input pair order on equal orbs", () => {
    const configured=policy({bodies:["A","B","C"],aspects:[{type:"conjunction",orb:10}]});
    const found=findConfiguredAspects([position("C",4),position("A",0),position("B",2)],configured).aspects;
    expect(found.map(v=>[v.a,v.b,v.orb])).toEqual([["C","B",2],["A","B",2],["C","A",4]]);
  });
});

describe("instantaneous motion and circular corners", () => {
  it.each([
    [359,1,1,0,0,"applying"], [359,1,-1,0,0,"separating"],
    [72.25,0,-1,0,72,"applying"], [71.75,0,-1,0,72,"separating"],
    [0,0,1,0,30,"applying"], [0,0,-1,0,30,"applying"],
    [180,0,1,0,150,"applying"], [180,0,-1,0,150,"applying"],
    [0,0,1,0,0,"separating"], [0,0,-1,0,0,"separating"],
    [180,0,1,0,180,"separating"], [180,0,-1,0,180,"separating"],
    [0,0,1,1,0,"stationary"], [180,0,1,1,150,"stationary"]
  ] as const)("longitude %s/%s, speed %s/%s, angle %s is %s", (a,b,va,vb,angle,motion) => {
    const configured=policy({aspects:[{type:"test",angle,orb:180}]});
    expect(findConfiguredAspects(pair(a,b,va,vb),configured).aspects[0]?.motion).toBe(motion);
  });

  it("agrees with an independent forward vector-angle oracle at minor-aspect corners and regular points", () => {
    const rad=Math.PI/180;
    const vectorDistance=(a:number,b:number)=>Math.atan2(Math.abs(Math.sin((a-b)*rad)),Math.cos((a-b)*rad))/rad;
    for(const angle of [0,30,45,60,72,90,120,135,144,150,180]){
      const configured=policy({aspects:[{type:"test",angle,orb:180}],stationaryRelativeSpeed:0});
      for(const a of [0,0.01,29.5,71.5,120,179.99,180,180.01,270,359.99]){
        for(const velocity of [-2,-0.5,0.5,2]){
          const now=Math.abs(vectorDistance(a,0)-angle);
          const later=Math.abs(vectorDistance(a+velocity*0.0001,0)-angle);
          const expected:ConfiguredAspectMotion=later<now?"applying":"separating";
          expect(findConfiguredAspects(pair(a,0,velocity),configured).aspects[0]?.motion,`${a}/${angle}/${velocity}`).toBe(expected);
        }
      }
    }
  });

  it("names the stationary boundary and never treats missing speed as zero", () => {
    const configured=policy({stationaryRelativeSpeed:0.01});
    expect(findConfiguredAspects(pair(1,0,0.009),configured).aspects[0]?.motion).toBe("stationary");
    expect(findConfiguredAspects(pair(1,0,0.01),configured).aspects[0]?.motion).toBe("separating");
    expect(findConfiguredAspects(pair(1,0,0,0),policy({stationaryRelativeSpeed:0})).aspects[0]?.motion).toBe("stationary");
    expect(()=>findConfiguredAspects([{body:"A",lon:0,speed:null}] as unknown as AspectPosition[],configured)).toThrow(/speed/);
  });
});

describe("legacy compatibility", () => {
  it("preserves default matches and motion on real charts, with exactly bounded configured orbs", () => {
    for(const utc of ["1908-02-11T09:23:00Z","2000-01-01T12:00:00Z","2026-09-28T00:00:00Z"]){
      const chart=natalChart({utc});
      const aspects=findConfiguredAspects(chart.bodies,DEFAULT_ASPECT_POLICY).aspects;
      expect(aspects.map(semanticFields)).toEqual(chart.aspects.map(semanticFields));
      expectBoundedOrbs(aspects,chart.bodies);
    }
  });

  it("preserves defaults across seeded geometry, retrogrades, wrap and equal speeds", () => {
    let seed=991;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
    for(let n=0;n<100;n++){
      const bodies=DEFAULT_ASPECT_POLICY.bodies.map(body=>({body,lon:random()*360,speed:n%10===0?0:random()*30-15,lat:0,retrograde:false,sign:"aries",degree:0})) as BodyPosition[];
      const aspects=findConfiguredAspects(bodies,DEFAULT_ASPECT_POLICY).aspects;
      expect(aspects.map(semanticFields)).toEqual(findAspects(bodies).map(semanticFields));
      expectBoundedOrbs(aspects,bodies);
    }
  });
});

describe("invalid policy and position boundaries", () => {
  it.each([
    null, {unexpected:true}, {bodies:["A","A"]}, {bodies:[""]}, {bodies:[" A"]},
    {aspects:[{type:"square",angle:91,orb:1}]}, {aspects:[{type:"custom",orb:1}]},
    {aspects:[{type:"custom",angle:181,orb:1}]}, {aspects:[{type:"square",orb:NaN}]},
    {aspects:[{type:"square",orb:{applying:1,separating:1}}]},
    {aspects:[{type:"square",orb:-1}]}, {aspects:[{type:"square",orb:Infinity}]},
    {aspects:[{type:"square",orb:1},{type:"square",orb:2}]},
    {bodyOrbs:{Unknown:1}}, {stationaryRelativeSpeed:-1}, {stationaryRelativeSpeed:NaN}
  ])("rejects invalid configuration %#", input => {
    expect(()=>createAspectPolicy(input as unknown as AspectPolicyInput)).toThrow(RangeError);
  });

  it("rejects sparse/accessor data without invoking its getter", () => {
    let called=false;
    const input=Object.defineProperty({},"aspects",{enumerable:true,get(){called=true;return [];}});
    expect(()=>createAspectPolicy(input)).toThrow(RangeError);expect(called).toBe(false);
    expect(()=>createAspectPolicy({bodies:Array(1) as string[]})).toThrow(RangeError);
    expect(()=>findConfiguredAspects(Array(1) as AspectPosition[],policy())).toThrow(RangeError);
    const row=Object.defineProperty({body:"A",lon:0},"speed",{enumerable:true,get(){called=true;return 0;}});
    expect(()=>findConfiguredAspects([row] as AspectPosition[],policy())).toThrow(RangeError);expect(called).toBe(false);
  });

  it("validates duplicates, ranges and all supplied speeds, including excluded rows", () => {
    for(const rows of [
      [position("A",0),position("A",1)], [position("A",360)], [position("A",-1)],
      [position("A",NaN)], [position("A",0,Infinity)], [position("Excluded",0,NaN)],
      [{body:"A",lon:0}], [{body:"A",lon:0,speed:null}]
    ]) expect(()=>findConfiguredAspects(rows as AspectPosition[],policy())).toThrow(RangeError);
  });

  it("rejects caller-forged policies and permits safe special body labels", () => {
    expect(()=>findConfiguredAspects(pair(0,0),JSON.parse(JSON.stringify(DEFAULT_ASPECT_POLICY)))).toThrow(/createAspectPolicy/);
    const special=createAspectPolicy({bodies:["__proto__","constructor"],bodyOrbs:JSON.parse('{"__proto__":0}'),aspects:[{type:"conjunction",orb:5}]});
    expect(findConfiguredAspects([position("__proto__",0),position("constructor",1)],special).aspects).toEqual([]);
    expect(findConfiguredAspects([position("__proto__",0),position("constructor",0)],special).aspects).toHaveLength(1);
  });
});
