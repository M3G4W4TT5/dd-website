#!/usr/bin/python3
"""Read-only upstream resolution into a new directory; review output before repinning.
No Docker, provider changes, secrets or automatic repository edits.
"""
import urllib.request,urllib.parse,json,hashlib,concurrent.futures,datetime,pathlib,sys
refs=[row['tag'] for row in json.loads((pathlib.Path(__file__).resolve().parent/'image-inventory.json').read_text())['images']]
accept=','.join(['application/vnd.oci.image.index.v1+json','application/vnd.docker.distribution.manifest.list.v2+json','application/vnd.oci.image.manifest.v1+json','application/vnd.docker.distribution.manifest.v2+json'])
if len(sys.argv)!=2:raise ValueError('New output directory required; never overwrites inventory automatically')
root=pathlib.Path(sys.argv[1]);root.mkdir(mode=0o700)
def resolve(ref):
 name,tag=ref.rsplit(':',1);repo=name if '/' in name else 'library/'+name;prefix=name.replace('/','-')
 token=json.load(urllib.request.urlopen('https://auth.docker.io/token?'+urllib.parse.urlencode({'service':'registry.docker.io','scope':'repository:'+repo+':pull'}),timeout=20))['token']
 def request(kind,value):
  url='https://registry-1.docker.io/v2/'+repo+'/'+kind+'/'+value
  with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Accept':accept}),timeout=25) as response:body=response.read(8*1024*1024);header=response.headers.get('Docker-Content-Digest')
  digest='sha256:'+hashlib.sha256(body).hexdigest()
  if header and header!=digest:raise ValueError('Registry digest mismatch')
  if value.startswith('sha256:') and value!=digest:raise ValueError('Requested digest mismatch')
  if kind=='manifests' and value==tag:(root/(prefix+'.manifest.json')).write_bytes(body)
  return json.loads(body),digest
 index,digest=request('manifests',tag)
 platforms=[m for m in index.get('manifests',[]) if m.get('platform',{}).get('os')=='linux' and m.get('platform',{}).get('architecture')=='amd64']
 if 'manifests' in index:
  if len(platforms)!=1:raise ValueError('Exactly one linux/amd64 image required')
  manifest,platform_digest=request('manifests',platforms[0]['digest'])
 else:
  manifest,platform_digest=index,digest
 config,config_digest=request('blobs',manifest['config']['digest'])
 if config.get('os')!='linux' or config.get('architecture')!='amd64':raise ValueError('Platform config mismatch')
 prefix=name.replace('/','-')
 (root/(prefix+'-index.json')).write_text(json.dumps(index,indent=2)+'\n')
 annotations=config.get('config',{}).get('Labels',{}) or {}
 provenance=[]
 for descriptor in index.get('manifests',[]):
  if descriptor.get('annotations',{}).get('vnd.docker.reference.digest')!=platform_digest:continue
  attestation,att_digest=request('manifests',descriptor['digest'])
  for layer in attestation.get('layers',[]):
   if layer.get('annotations',{}).get('in-toto.io/predicate-type') not in ('https://slsa.dev/provenance/v0.2','https://slsa.dev/provenance/v1'):continue
   statement,statement_digest=request('blobs',layer['digest'])
   if not any(subject.get('digest',{}).get('sha256')==platform_digest.removeprefix('sha256:') for subject in statement.get('subject',[])):raise ValueError('Attestation subject mismatch')
   predicate=statement.get('predicate',{})
   provenance.append({'manifest':att_digest,'statement':statement_digest,'predicate_type':statement.get('predicateType'),'builder':predicate.get('builder',{}).get('id'),'build_type':predicate.get('buildType'),'source_materials':[{'uri':m.get('uri'),'digest':m.get('digest')} for m in predicate.get('materials',[]) if m.get('uri','').startswith(('git+https://','https://github.com/'))],'verification':'Registry content digests and subject binding verified; cryptographic publisher signature unverified'})
 entry={'tag':ref,'reference':ref+'@'+digest,'digest':digest,'amd64_manifest':platform_digest,'amd64_config':config_digest,'platforms':sorted({m.get('platform',{}).get('os','')+'/'+m.get('platform',{}).get('architecture','') for m in index.get('manifests',[{'platform':{'os':config['os'],'architecture':config['architecture']}}]) if m.get('platform',{}).get('os')=='linux'}),'registry':'https://registry-1.docker.io/v2/'+repo+'/manifests/'+tag,'created':config.get('created'),'annotations':{k:v for k,v in annotations.items() if k.startswith('org.opencontainers.image.')},'manifest_file':prefix+'.manifest.json','amd64_provenance':provenance,'signature_verification':'unverified; cosign/notation unavailable and no publisher trust policy configured','attestation_descriptors':sum(1 for m in index.get('manifests',[{'platform':{'os':config['os'],'architecture':config['architecture']}}]) if m.get('annotations',{}).get('vnd.docker.reference.type')=='attestation-manifest')}
 print(ref+': '+digest+' (linux/amd64 verified)',flush=True)
 return entry
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for ref,result in zip(refs,pool.map(lambda ref:resolve(ref),refs)):results.append(result)
(root/'inventory.json').write_text(json.dumps({'resolved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'images':results},indent=2)+'\n')
