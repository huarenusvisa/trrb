"""Build reproducible public-domain Census 2026 geography; no job address inference."""
import csv,io,json,re,gzip,zipfile,sys,pathlib
source=pathlib.Path(sys.argv[1]); out=pathlib.Path('netlify/functions/_shared/geography')
def rows(file):
 with zipfile.ZipFile(source/file) as z:
  return list(csv.DictReader(io.StringIO(z.read(z.namelist()[0]).decode('utf-8-sig')),delimiter='|'))
def center(r): return [round(float(r['INTPTLAT']),6),round(float(r['INTPTLONG'].strip()),6)]
legacy=json.loads(pathlib.Path('huarengongzuo/regions.json').read_text()); cities={}
for filename in ['places.zip','towns.zip']:
 for r in rows(filename):
  name=r['NAME'].strip()
  if filename=='towns.zip' and not (r['FUNCSTAT']=='A' and re.search(r' (town|city|township|village)$',name)):continue
  name=re.sub(r' (city|town|village|CDP|borough|municipality|township|consolidated government|unified government)( \(balance\))?$','',name)
  key=(r['USPS'],name.lower())
  cities.setdefault(key,{'en':name,'state':r['USPS'],'lat':center(r)[0],'lng':center(r)[1],'aliases':[]})
# County names are regional centers, never precise job addresses.
county_source=source/'counties.zip'
if county_source.exists():
 for r in rows('counties.zip'):
  name=r['NAME'].strip();cities.setdefault((r['USPS'],name.lower()),{'en':name,'state':r['USPS'],'lat':center(r)[0],'lng':center(r)[1],'aliases':[],'region':True})
for c in legacy['cities']:
 cities[(c['state'],c['en'].lower())]={**cities.get((c['state'],c['en'].lower()),{}),**c}
zh={r['code']:r['zh'] for r in legacy['states']}
states=[{'code':r['USPS'],'en':r['NAME'],'zh':zh.get(r['USPS'],r['NAME']),'lat':center(r)[0],'lng':center(r)[1]} for r in rows('states.zip')]
catalog={'source':'US Census 2026 Gazetteer places, county subdivisions and ZCTAs','states':states,'cities':list(cities.values()),'zips':{r['GEOID']:center(r) for r in rows('zips.zip')}}
# GNIS includes unincorporated communities absent from Census place boundaries.
# Add only names with one unambiguous coordinate in the same state.
gnis=source/'gnis-job-places.json'
if gnis.exists():
 groups={}
 for feature in json.loads(gnis.read_text()):
  a=feature['attributes'];point=feature.get('geometry');
  if not point:continue
  if 'points' in point:
   points=point['points']
   if points and max(p[0] for p in points)-min(p[0] for p in points)<0.04 and max(p[1] for p in points)-min(p[1] for p in points)<0.04:
    feature['geometry']={'x':sum(p[0] for p in points)/len(points),'y':sum(p[1] for p in points)/len(points)};point=feature['geometry']
  if 'y' not in point or 'x' not in point:continue
  groups.setdefault((a['state_alpha'],a['gaz_name'].lower()),[]).append(feature)
 for (state,name),features in groups.items():
  coords={(round(f['geometry']['y'],4),round(f['geometry']['x'],4)) for f in features}
  if len(coords)!=1 or (state,name) in cities:continue
  f=features[0];lat,lng=next(iter(coords));cities[(state,name)]={'en':f['attributes']['gaz_name'],'state':state,'lat':lat,'lng':lng,'aliases':[],'gnis_id':f['attributes']['gaz_id']}
 catalog['cities']=list(cities.values());catalog['source']+='; USGS GNIS populated places (checked 2026-10-02)'
# Reviewed spelling / official-name variants. Keep the state on every lookup.
aliases={
 'MA':{'Foxborough':['Foxboro'],'Middleborough':['Middleboro'],'Barnstable Town':['Barnstable'],'Braintree Town':['Braintree'],'Randolph Town':['Randolph']},
 'CA':{'Industry':['City of Industry'],'El Paso de Robles (Paso Robles)':['Paso Robles'],'San Buenaventura (Ventura)':['Ventura'],'Carmel-by-the-Sea':['Carmel'],'East Los Angeles':['East LA'],'Vandenberg AFB':['Vandenberg','Vandenberg Space Force Base']},
 'KY':{'Lexington-Fayette urban county':['Lexington']},
 'PA':{'Kennett Square':['Kennett Sq'],'McConnellsburg':['Mc Connellsbg'],'Newtown Square':['Newtown Sq'],'Feasterville':['Feasterville Trevose']},
 'HI':{'Kailua':['Kailua Kona'],'Haiku-Pauwela':['Haiku']},'VT':{'South Burlington':['S Burlington'],'Saint Albans Bay':['St Albans Bay']},'OH':{'Fremont':['Freemont']},'AR':{'Fayetteville':['Fayettville']},
 'WV':{'Bath (Berkeley Springs)':['Berkeley Springs']}}
aliases['GA']={n+' County':[n] for n in ['Bibb','DeKalb','Fulton','Paulding']}
for state,items in aliases.items():
 for canonical,variants in items.items():
  c=cities.get((state,canonical.lower()))
  if c:c['aliases']=list(set(c['aliases']+variants))
# Charlestown has namesakes in Massachusetts; the Boston neighborhood is explicitly identified by Suffolk county in GNIS.
if gnis.exists():
 for f in json.loads(gnis.read_text()):
  a=f['attributes'];p=f.get('geometry',{}).get('points',[])
  if a['gaz_name']=='Charlestown' and a['state_alpha']=='MA' and a['county_name']=='Suffolk' and len(p)==1:
   cities[('MA','charlestown')]={'en':'Charlestown','state':'MA','lat':p[0][1],'lng':p[0][0],'aliases':[],'gnis_id':a['gaz_id']}
translations={'Worcester':'伍斯特','Quincy':'昆西','Cambridge':'剑桥','Lowell':'洛厄尔','Newton':'牛顿','Somerville':'萨默维尔','Waltham':'沃尔瑟姆','Brookline':'布鲁克莱恩','Wilmington':'威尔明顿','Framingham':'弗雷明汉','Plymouth':'普利茅斯','Hyannis':'海恩尼斯','Falmouth':'法尔茅斯'}
for en,zh in translations.items():
 c=cities.get(('MA',en.lower()))
 if c:c['zh']=zh
if gnis.exists():
 counties={}
 for f in json.loads(gnis.read_text()):
  a=f['attributes'];counties.setdefault((a['state_alpha'],a['gaz_name'].lower()),set()).add(a['county_name'])
 for key,c in cities.items():
  values=counties.get(key,set())
  if len(values)==1:c['county']=next(iter(values))
catalog['cities']=list(cities.values())
raw=json.dumps(catalog,separators=(',',':'),ensure_ascii=False).encode(); (out/'catalog.json.gz').write_bytes(gzip.compress(raw,mtime=0))
print(json.dumps({'cities':len(cities),'MA':sum(c['state']=='MA' for c in cities.values()),'states':len(states),'ZIPs':len(catalog['zips']),'bytes':len(raw),'gzip_bytes':(out/'catalog.json.gz').stat().st_size}))
