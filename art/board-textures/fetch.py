#!/usr/bin/env python3
"""Fetch the CC0 Poly Haven 2k sources used by gen_mats.py into ./.cache (gitignored)."""
import json, os, urllib.request
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')
IDS = ('aerial_ground_rock dirt_aerial_02 dry_ground_rocks rocks_ground_08 red_laterite_soil_stones '
       'mud_cracked_dry_03 burned_ground_01 cobblestone_floor_08').split()
os.makedirs(CACHE, exist_ok=True)
for i in IDS:
    d = json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.polyhaven.com/files/{i}', headers={'User-Agent': 'x'})))
    for k, n in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('Rough', 'rough')):
        p = os.path.join(CACHE, f'{i}_{n}.jpg')
        if not os.path.exists(p):
            urllib.request.urlretrieve(d[k]['2k']['jpg']['url'], p)
    print(i, flush=True)
