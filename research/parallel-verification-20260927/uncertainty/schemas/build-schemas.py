import json,pathlib
P=pathlib.Path(__file__).parent

def obj(p,required=None): return {'type':'object','properties':p,'required':list(p) if required is None else required,'additionalProperties':False}
def arr(s,n=1):return {'type':'array','items':s,'minItems':n}
def enum(*v):return {'enum':list(v)}
def num(a=None,b=None):
 d={'type':'number'}
 if a is not None:d['minimum']=a
 if b is not None:d['maximum']=b
 return d
s={'type':'string'}; bo={'type':'boolean'}
version={'const':'zodiacs.birth-window.experimental/0.1'}
iso={'type':'string','pattern':r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'}
wall={'type':'string','pattern':r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$'}
interval=obj({'id':s,'start':iso,'end':iso,'includeStart':bo,'includeEnd':bo})
point=obj({'kind':{'const':'point'},'latitude':num(-90,90),'longitude':num(-180,180)})
location={'oneOf':[point,obj({'kind':{'const':'absent'}}),obj({'kind':{'const':'box'},'south':num(-90,90),'north':num(-90,90),'west':num(-180,180),'east':num(-180,180),'crossesAntimeridian':bo})]}
houses=enum('whole','placidus','porphyry','equal','equal-mc','vehlow','koch','regiomontanus','campanus','topocentric','alcabitius','morinus','meridian')
bodies=enum('Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','North Node','South Node')
feature={'oneOf':[obj({'id':s,'kind':{'const':'body-sign'},'body':bodies}),obj({'id':s,'kind':{'const':'angle-sign'},'angle':enum('asc','mc','dsc','ic')}),obj({'id':s,'kind':{'const':'body-house'},'body':bodies}),obj({'id':s,'kind':{'const':'aspect-present'},'a':bodies,'b':bodies,'angleDegrees':num(0,180),'orbDegrees':num(0,180)})]}
time={'oneOf':[obj({'kind':{'const':'utc-union'},'intervals':arr(interval)}),obj({'kind':{'const':'local-wall-window'},'start':wall,'end':wall,'includeStart':bo,'includeEnd':bo,'calendar':enum('proleptic-gregorian','julian','civil-cutover'),'timeZone':s,'clockDataset':obj({'name':s,'version':s,'hash':s}),'foldPolicy':enum('all','earlier','later'),'gapPolicy':enum('reject','exclude-and-report')})]}
dt={'oneOf':[obj({'kind':{'const':'engine'}}),obj({'kind':{'const':'pinned'},'seconds':num(-1e10,1e10)}),obj({'kind':{'const':'interval'},'lowerSeconds':num(-1e10,1e10),'upperSeconds':num(-1e10,1e10)})]}
prior={'oneOf':[obj({'kind':{'const':'none'}}),obj({'kind':{'const':'uniform-utc-union'},'justification':s}),obj({'kind':{'const':'external-measure'},'measureId':s,'version':s,'sha256':s,'justification':s})]}
commit={'oneOf':[{'type':'null'},{'type':'string','pattern':'^[0-9a-f]{40}$'}]}
request=obj({'schemaVersion':version,'requestId':s,'mode':enum('finite-preview','certified'),'time':time,'location':location,'model':obj({'engineCommit':commit,'houseSystems':dict(arr(houses),uniqueItems=True),'deltaT':dt}),'features':arr(feature),'budget':obj({'maxStepMs':{'type':'integer','minimum':1},'maxEvaluations':{'type':'integer','minimum':1,'maximum':1000000}}),'prior':prior})
request.update({'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'urn:zodiacs:birth-window:experimental:0.1:request','title':'Experimental birth-window request; cross-field validation is mandatory'})
value={'oneOf':[s,{'type':'integer'},bo]}
witness=obj({'at':iso,'value':value,'requestedHouseSystem':houses,'actualHouseSystem':{'oneOf':[houses,{'type':'null'}]},'engineFlags':arr(s,0),'latitude':num(-90,90),'longitude':num(-180,180)},['at','value','requestedHouseSystem','actualHouseSystem','engineFlags'])
issue=obj({'at':iso,'reason':s})
finding=obj({'featureId':s,'houseSystem':houses,'status':enum('certified-constant','observed-constant','variable','unresolved','unavailable'),'complete':bo,'values':arr(value,0),'witnesses':arr(witness,0),'issues':arr(issue,0),'probabilities':{'type':'null'},'certificate':{'type':['object','null']}})
finding['properties']['values']['uniqueItems']=True
finding['allOf']=[
 {'if':{'properties':{'status':{'const':'certified-constant'}}},'then':{'properties':{'complete':{'const':True},'values':{'minItems':1,'maxItems':1},'certificate':{'type':'object'},'issues':{'maxItems':0}}}},
 {'if':{'properties':{'status':{'const':'observed-constant'}}},'then':{'properties':{'complete':{'const':False},'values':{'minItems':1,'maxItems':1},'certificate':{'type':'null'}}}},
 {'if':{'properties':{'status':{'const':'variable'}}},'then':{'properties':{'values':{'minItems':2}}}},
 {'if':{'properties':{'status':{'enum':['unavailable','unresolved']}}},'then':{'properties':{'complete':{'const':False},'values':{'maxItems':0},'issues':{'minItems':1}}}}
]
result=obj({'schemaVersion':version,'requestId':s,'requestSha256':{'type':'string','pattern':'^[0-9a-f]{64}$'},'provenance':obj({'engineVersion':s,'assertedEngineCommit':commit,'moduleSha256':s,'ephemeris':{'type':['object','null']},'runtime':s,'toolVersion':s}),'coverage':obj({'mode':enum('finite-preview','certified'),'domain':s,'complete':bo,'finiteDomainEvaluated':bo,'sampleCount':{'type':'integer','minimum':0},'chartEvaluations':{'type':'integer','minimum':0},'maxObservedGridGapMs':num(0),'requestedMaxStepMs':num(1),'note':s}),'findings':arr(finding),'warnings':arr(s,0)})
result.update({'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'urn:zodiacs:birth-window:experimental:0.1:result','title':'Experimental birth-window result'})
for name,data in [('request',request),('result',result)]: (P/(name+'.schema.json')).write_text(json.dumps(data,indent=2)+'\n')
