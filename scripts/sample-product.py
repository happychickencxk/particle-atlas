"""Sample the alpha/luminance of the edited product; does not alter the image."""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
source=root/'assets/product/headphones.png'
im=np.array(Image.open(source).convert('RGBA'))
h,w=im.shape[:2]
gray=im[:,:,:3].astype(float).mean(axis=2)/255
ys,xs=np.where(im[:,:,3]>60)
weight=(im[ys,xs,3]/255)*(.25+gray[ys,xs])
rng=np.random.default_rng(1771)
k=rng.choice(len(xs),36000,replace=True,p=weight/weight.sum())
points=np.column_stack(((xs[k]+.5)/w-.5,(.5-(ys[k]+.5)/h)*h/w,gray[ys[k],xs[k]]))
obj={'width':w,'height':h,'seed':1771,'count':36000,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'points':points.round(6).ravel().tolist()}
(root/'data/product-points.js').write_text('window.ATLAS_PRODUCT='+json.dumps(obj,separators=(',',':'))+';',encoding='utf-8')
print(json.dumps({k:v for k,v in obj.items() if k!='points'}))
