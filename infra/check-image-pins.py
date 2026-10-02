#!/usr/bin/python3
"""Reject mutable/unreviewed literal operational images; no network or Docker needed."""
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT=Path(__file__).resolve().parent.parent
# Dynamic first-party references are constrained by the existing manifest validators.
VARIABLES=('${DD_BOOKING_IMAGE:?', '${DD_COMMUNICATIONS_IMAGE:?', '${DD_WORKER_IMAGE:?', '${DD_PRIMARY_COMMUNICATIONS_IMAGE:?')
LITERAL=re.compile(r'''(['"])([a-z][a-z0-9.-]*(?:/[a-z0-9._-]+)*(?::[A-Za-z0-9_.-]+)(?:@sha256:[a-f0-9]+)?)\1''')

def inventory(root):
 data=json.loads((root/'infra/image-inventory.json').read_text())
 images=data['images'];refs={row['reference'] for row in images}
 if len(refs)!=len(images):raise ValueError('Duplicate image inventory')
 for row in images:
  if row['reference']!=row['tag']+'@'+row['digest'] or not re.fullmatch('sha256:[a-f0-9]{64}',row['digest']):raise ValueError('Invalid pin inventory')
  raw=(root/'infra/image-manifests'/row['manifest_file']).read_bytes()
  if 'sha256:'+hashlib.sha256(raw).hexdigest()!=row['digest']:raise ValueError('Manifest evidence digest differs')
  manifest=json.loads(raw)
  if 'manifests' in manifest:
   amd64=[m for m in manifest['manifests'] if m.get('platform',{}).get('os')=='linux' and m.get('platform',{}).get('architecture')=='amd64']
   if len(amd64)!=1 or amd64[0]['digest']!=row['amd64_manifest']:raise ValueError('AMD64 evidence differs')
  elif row['amd64_manifest']!=row['digest']:raise ValueError('Single-platform evidence differs')
  if 'linux/amd64' not in row['platforms']:raise ValueError('Required platform missing')
 return refs

def validate_reference(value,approved,stages=()):
 value=value.strip('"\'')
 if value in stages:return
 if value.startswith(VARIABLES):return
 if value not in approved:raise ValueError('Mutable or unreviewed image: '+value)

def check_text(text,path,approved):
 stages=set();found=set()
 for number,line in enumerate(text.splitlines(),1):
  match=re.match(r'\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?',line,re.I)
  if match and (path.name.startswith("Dockerfile") or ":" in match[1] or "@sha256:" in match[1]):
   validate_reference(match[1],approved,stages);found.add(match[1])
   if match[2]:stages.add(match[2])
  match=re.match(r'\s*image:\s*([^#]+)',line)
  if match:
   value=match[1].strip()
   # Required Compose variable expressions may contain an explanatory message.
   validate_reference(value,approved);found.add(value)
  # These unit fixtures contain deliberate rejected manifest references.
  literal_checks = [] if path.name in ("deploy.test.py","primary-release.test.py") else LITERAL.finditer(line)
  for match in literal_checks:
   value=match[2]
   if value in ('no-new-privileges:true','presale:event.checkout','presale:event.order.pay','event.orders:read','event.orders:write','organizer.teams:write','organizer.events:create','event.items:write','event.settings.general:write'):continue
   if value.startswith('node:') and re.search(r'''(?:from\s*|require\(|import\s*\(?)["']'''+re.escape(value)+r'''["']''',line):continue
   validate_reference(value,approved);found.add(value)
 return found

def paths(root):
 for folder in ('infra','.github/workflows'):
  for path in (root/folder).rglob('*'):
   if '__pycache__' in path.parts or path.name in ('check-image-pins.py','image-pins.test.py'):continue
   if path.is_file() and (path.suffix in ('.py','.sh','.mjs','.yaml','.yml') or path.name.startswith('Dockerfile')):yield path
 for path in root.glob('*'):
  if path.is_file() and (path.suffix in ('.yaml','.yml') or path.name.startswith('Dockerfile')):yield path

def main(root=ROOT):
 approved=inventory(root);found=set();count=0
 for path in paths(root):
  try:found.update(check_text(path.read_text(),path,approved))
  except ValueError as e:raise ValueError(str(path.relative_to(root))+': '+str(e)) from None
  count+=1
 if not approved<=found:raise ValueError('Unused/missing inventory reference')
 print(f'PASS immutable image inventory across {count} operational files; six approved versions, linux/amd64 evidence')
if __name__=='__main__':
 try:main()
 except (ValueError,KeyError,OSError) as e:print(str(e),file=sys.stderr);sys.exit(1)
