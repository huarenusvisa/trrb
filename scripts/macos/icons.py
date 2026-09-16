import json,subprocess
from pathlib import Path
out=Path('apps/macos/Resources/Assets.xcassets/AppIcon.appiconset');out.mkdir(parents=True,exist_ok=True)
items=[]
for size in [16,32,128,256,512]:
 for scale in [1,2]:
  name=f'icon-{size}@{scale}x.png'
  subprocess.run(['sips','-z',str(size*scale),str(size*scale),'apps/mobile/assets/app-icon-1024.png','--out',str(out/name)],check=True,stdout=subprocess.DEVNULL)
  items.append(dict(idiom='mac',size=f'{size}x{size}',scale=f'{scale}x',filename=name))
(out/'Contents.json').write_text(json.dumps(dict(images=items,info=dict(version=1,author='xcode'))))
