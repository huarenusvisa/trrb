"""Compose SVG store artwork from unchanged native screenshots."""
import argparse,base64,json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import Image
p=argparse.ArgumentParser()
p.add_argument('raw',type=Path);p.add_argument('output',type=Path)
p.add_argument('--font',required=True);p.add_argument('--family',choices=['iphone','ipad'],required=True)
a=p.parse_args();font=TTFont(a.font);glyphs=font.getGlyphSet();cmap=font.getBestCmap();units=font['head'].unitsPerEm

def text(value,x,y,size,color):
 result=[];scale=size/units
 for ch in value:
  glyph=glyphs[cmap[ord(ch)]];pen=SVGPathPen(glyphs);glyph.draw(pen)
  result.append(f'<path fill="{color}" transform="translate({x},{y}) scale({scale},{-scale})" d="{pen.getCommands()}"/>')
  x+=glyph.width*scale
 return ''.join(result)

pages=[('01-home','读懂时事','看见华人生活','中美新闻 · 重要报道 · 每日更新','#b51d1a'),('02-topics','重要议题','持续关注','人物动态 · 选举进展 · 专题聚焦','#b51d1a'),('03-jobs','寻找机会','连接理想工作','华人工作网 · 招聘与求职入口','#08745b'),('04-judges','查阅法官数据','了解移民法庭','AsylumJudge · 法庭与法官信息','#08745b'),('05-community','在这里交流','与华人同行','唐人社区 · 经验分享 · 生活互助','#b51d1a')]
a.output.mkdir(parents=True,exist_ok=True);manifest=[]
for index,(name,t1,t2,sub,accent) in enumerate(pages,1):
 sources=list(a.raw.rglob(name+'.png'))
 if len(sources)!=1: raise ValueError(f'Expected one native capture: {name}')
 source=sources[0]
 with Image.open(source) as im: sw,sh=im.size
 tablet=a.family=='ipad';w,h=(2064,2752) if tablet else (1320,2868);margin=120 if tablet else 96;top=650 if tablet else 670
 ih=h-top-110;iw=ih*sw/sh
 if iw>w-2*margin: iw=w-2*margin;ih=iw*sh/sw
 x=(w-iw)/2;r=44 if tablet else 64;size=138 if tablet else 112
 raw=base64.b64encode(source.read_bytes()).decode()
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs><clipPath id="screen"><rect x="{x}" y="{top}" width="{iw}" height="{ih}" rx="{r}"/></clipPath></defs><rect width="{w}" height="{h}" fill="#f7f5f0"/><circle cx="{w}" cy="{h*.65}" r="{w*.6}" fill="{accent}" opacity=".045"/><rect x="{margin}" y="98" width="9" height="40" fill="{accent}"/>'
 svg+=text('唐人日报',margin+29,135,38,'#1c2531')+text('TANG REN DAILY',w-(460 if tablet else 416),132,27,'#6b727b')
 svg+=text(t1,margin,300,size,'#15222d')+text(t2,margin,455,size,accent)+text(sub,margin,552,42 if tablet else 34,'#616971')
 svg+=f'<rect x="{x-23}" y="{top-23}" width="{iw+46}" height="{ih+46}" rx="{r+23}" fill="#15222d"/><image x="{x}" y="{top}" width="{iw}" height="{ih}" clip-path="url(#screen)" xlink:href="data:image/png;base64,{raw}"/>'
 svg+=text(f'{index:02d} / 05',margin,h-35,25,'#7b8185')+'</svg>'
 (a.output/(name+'.svg')).write_text(svg)
 manifest.append({'layout':name+'.svg','source':str(source),'source_dimensions':[sw,sh],'output_dimensions':[w,h]})
(a.output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
