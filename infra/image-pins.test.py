import importlib.util
from pathlib import Path
import tempfile
import unittest
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('pins',HERE/'check-image-pins.py');pins=importlib.util.module_from_spec(spec);spec.loader.exec_module(pins)
class PinsTests(unittest.TestCase):
 def test_all_operational_references_and_manifest_evidence(self):pins.main()
 def test_mutable_wrong_digest_unknown_names_aliases_and_new_locations(self):
  approved={'node:24.20.0-bookworm-slim@sha256:'+'a'*64}
  for text in ['FROM node:24.20.0-bookworm-slim','image: node:latest',"IMAGE='ubuntu:latest'","docker run 'evil.example/pretix/standalone:2026.7.0'",'FROM ubuntu', 'image: docker.io/library/node:24.20.0-bookworm-slim@sha256:'+'a'*64, 'image: node:24.20.0-bookworm-slim@sha256:'+'b'*64]:
   with self.subTest(text=text),self.assertRaises(ValueError):pins.check_text(text,Path('Dockerfile') if text.startswith('FROM ') else Path('new-operation.py'),approved)
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'infra').mkdir();(root/'.github/workflows').mkdir(parents=True);new=root/'infra/new-compose.yaml';new.write_text('image: ubuntu:latest\n')
   self.assertIn(new,list(pins.paths(root)))
 def test_internal_stages_and_manifest_bound_first_party_variables(self):
  approved={'node:24.20.0-bookworm-slim@sha256:'+'a'*64};pin=next(iter(approved))
  pins.check_text('FROM '+pin+' AS dependencies\nFROM dependencies AS source\nimage: ${DD_BOOKING_IMAGE:?Reviewed digest required}\n',Path('Dockerfile'),approved)
  pins.check_text("import http from 'node:http';",Path('fixture.py'),approved)
  with self.assertRaises(ValueError):pins.check_text('image: ${UNTRUSTED_IMAGE:-node:latest}',Path('compose.yaml'),approved)
if __name__=='__main__':unittest.main()
