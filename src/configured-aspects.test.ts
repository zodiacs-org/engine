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
import type { BodyPosition } from "./types.js";

const position = (body: string, lon: number, speed = 1): AspectPosition => ({body,lon,speed});
const pair = (aLongitude: number, bLongitude: number, aSpeed = 1, bSpeed = 0) => [position("A",aLongitude,aSpeed),position("B",bLongitude,bSpeed)];
function policy(options: AspectPolicyInput = {}) {
  return createAspectPolicy({bodies:["A","B"],aspects:[{type:"conjunction",orb:8}],...options});
}
const legacyFields = ({a,b,type,orb,applying}: ConfiguredAspect) => ({a,b,type,orb,applying});

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

  it("does not share or consult the legacy mutable ASPECTS definitions", () => {
    const legacy = ASPECTS[0] as unknown as {orb:number};
    const saved = legacy.orb;
    try {
      legacy.orb=0;
      const configured=createAspectPolicy();
      expect(configured.aspects[0]?.orb.applying).toBe(8);
      expect(findConfiguredAspects([position("Mars",0),position("Saturn",5)],configured).aspects).toHaveLength(1);
    } finally { legacy.orb=saved; }
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
  it("preserves every legacy result field on real charts with default policy", () => {
    for(const utc of ["1907-07-06T15:07:00Z","2000-01-01T12:00:00Z","2026-09-28T00:00:00Z"]){
      const chart=natalChart({utc});
      expect(findConfiguredAspects(chart.bodies,DEFAULT_ASPECT_POLICY).aspects.map(legacyFields)).toEqual(chart.aspects);
    }
  });

  it("preserves defaults across seeded geometry, retrogrades, wrap and equal speeds", () => {
    let seed=991;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
    for(let n=0;n<100;n++){
      const bodies=DEFAULT_ASPECT_POLICY.bodies.map(body=>({body,lon:random()*360,speed:n%10===0?0:random()*30-15,lat:0,retrograde:false,sign:"aries",degree:0})) as BodyPosition[];
      expect(findConfiguredAspects(bodies,DEFAULT_ASPECT_POLICY).aspects.map(legacyFields)).toEqual(findAspects(bodies));
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
