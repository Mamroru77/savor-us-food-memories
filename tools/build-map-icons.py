#!/usr/bin/env python3
"""Offline native PNG exports. Developer-only: pip install cairosvg pillow.
SVG sources remain editable; visible inner glyphs are official Lucide data.
Brand/container paths and original map geometry are intentionally not icons.
"""
from pathlib import Path
import xml.etree.ElementTree as ET
import cairosvg
import sys
BUTTONS_ONLY="--buttons-only" in sys.argv
ROOT=Path(__file__).resolve().parents[1]
ICONS=ROOT/'miniprogram/images/icons/lucide'
NS='{http://www.w3.org/2000/svg}'
ET.register_namespace('',NS[1:-1])
def sync(p):
 tree=ET.parse(p)
 for g in tree.getroot().iter(NS+'g'):
  name=g.get('data-lucide')
  if not name: continue
  for child in list(g): g.remove(child)
  for child in ET.parse(ICONS/(name+'.svg')).getroot():g.append(child)
 tree.write(p,encoding='unicode')
 return p.read_bytes()
for state in ([] if BUTTONS_ONLY else ['normal','selected']):
 for kind in ['frame','fallback']:
  name=f'landmark-{state}-{kind}'
  source=sync(ROOT/'design-references'/f'{name}.svg')
  cairosvg.svg2png(bytestring=source,write_to=str(ROOT/'miniprogram/images/markers'/f'{name}.png'),output_width=768,output_height=858)
for direction in ['up','down']:
 for suffix in ['', '-dusk']:
  p=ROOT/f'miniprogram/images/markers/stack-button-{direction}{suffix}.svg'
  cairosvg.svg2png(bytestring=sync(p),write_to=str(p.with_suffix('.png')),output_width=96,output_height=96)
for direction in ([] if BUTTONS_ONLY else ['left','right']):
 p=ICONS/f'chevron-{direction}.svg';tree=ET.parse(p);svg=tree.getroot()
 svg.set('stroke','#34483c');svg.set('stroke-width','1.75')
 cairosvg.svg2png(bytestring=ET.tostring(svg),write_to=str(p.with_suffix('.png')),output_width=72,output_height=72)
print('Exported 4 stack buttons from SVG.' if BUTTONS_ONLY else 'Exported 4 stamps, 4 stack buttons and 2 paging arrows from SVG.')
