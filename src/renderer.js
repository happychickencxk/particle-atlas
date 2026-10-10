import * as THREE from 'three';
import {IDS,EARTH_ROT,TERRAIN_ROT,geoPoint,plotX,plotY} from './scenes.js';
import {ImpactField,DampedValue,IMPACT_CAPACITY} from './impact-field.js';
import {fieldVertex,fieldFragment,earthVisibility,attachField,particleSeed,displaceParticlePixel} from './particle-field.js';
import {createInfinityPath,infinityVertex,FLOW_RATE} from './infinity-flow.js';
const MAX=36000,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function rng(seed){return()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296}}
const vertex=`attribute vec3 target;attribute float shade;attribute float grain;attribute float size;attribute float phase;
uniform vec2 viewport;uniform float morph;uniform float clock;uniform float entity;uniform float retain;uniform float dpr;uniform float cloudScale;uniform vec2 anchor;uniform float targetScale;uniform mat4 objectTransform;uniform float earthScene;uniform vec3 cameraWorld;
varying float vShade;varying float vAlpha;
${fieldVertex}
${infinityVertex}
void main(){
 vec3 t=(objectTransform*vec4(target,1.)).xyz*targetScale+vec3(anchor,0.);
 float n=grain*61.7;vec3 cloud=position*cloudScale;
 float breath=1.+sin(clock*.24+n)*.045;cloud.xy*=breath;
 cloud.x+=sin(clock*.11+n)*8.;cloud.y+=cos(clock*.13+n)*7.;cloud.z+=sin(clock*.09+n)*12.;
 vec3 delta=vec3(sin(n+clock*.3),cos(n*1.3+clock*.21),sin(n*.7));
 float m=phase>.5?smoothstep(.20,1.,morph):morph;m*=1.-step(.985,grain)*.14;
 vFlowDirection=vec2(1.,0.);
 vFlowFoam=0.;waterCrest=0.;
 vec3 water=cloud;
 if(flowMix>.001)water=infinityPosition(clock);
 cloud=mix(cloud,water,flowMix);vFlowAmount=flowMix*(1.-m);
 vFlowFoam*=vFlowAmount;
 vec3 p=mix(cloud,t,m)+delta*(1.-m)*(1.-flowMix)*10.;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
 gl_PointSize=clamp(size*dpr*(1.+(1.-morph)*.25),.7,6.);
 vShade=mix(.40+grain*.48,shade,morph);
 float life=smoothstep(.90,1.,morph)*smoothstep(.35,.95,entity);
 gl_PointSize*=mix(1.,.90+.10*sin(clock*.8+n),life);
 float flow=.84+.16*sin(clock*1.25+target.x*14.+target.y*4.+n*.19);
 vAlpha=mix(.50,mix(.8,retain,entity),morph)*mix(1.,flow,life);
 if(vFlowAmount>.001){
 float s=fract(stream.x+clock*${FLOW_RATE}*stream.w);
 float crest=max(waterCrest,pow(.5+.5*sin((s-clock*.060)*31.41593+stream.y*55.),8.));
 float core=exp(-abs(stream.y)*45.0);
 vShade=mix(vShade,.46+.20*core+.30*crest,vFlowAmount);
 vAlpha=mix(vAlpha,.24+.23*core+.23*crest,vFlowAmount);
 vShade=mix(vShade,.98,vFlowFoam);
 vAlpha=mix(vAlpha,.62,vFlowFoam);
 float waterSize=mix(1.7+grain*3.6,1.5+grain*1.3,vFlowFoam);
 gl_PointSize=mix(gl_PointSize,waterSize*dpr,vFlowAmount);
 vec4 path=infinitySample(s);
 float under=1.-smoothstep(.025,.080,abs(path.x));
 vAlpha*=1.-vFlowAmount*under*step(path.z,0.)*.55;
 }
 vec3 normal=(objectTransform*vec4(target,0.)).xyz;
 float front=step(0.,dot(normal,cameraWorld-t));
 vAlpha*=1.-earthScene*smoothstep(.92,1.,morph)*(1.-front);
 applyParticleField(gl_Position,grain,gl_PointSize/fieldDpr,.95);
}`;
const fragment=`varying float vShade;varying float vAlpha;varying vec2 vFlowDirection;varying float vFlowAmount;varying float vFlowFoam;
${fieldFragment}
void main(){
 maskParticleHole();if(vAlpha<.001)discard;
 vec2 p=gl_PointCoord*2.-1.;
 vec2 direction=normalize(vFlowDirection);
 float along=dot(p,direction),across=dot(p,vec2(-direction.y,direction.x));
 float trail=vFlowAmount*(1.-vFlowFoam);
 float d=mix(dot(p,p),along*along+across*across/0.13,trail);
 if(d>1.)discard;
 float tail=mix(1.,.30+.70*smoothstep(-1.,.55,along),trail);
 float a=(1.-smoothstep(.25,1.,d))*vAlpha*tail;
 gl_FragColor=vec4(vec3(vShade)*vFieldTwinkle,a);
}`;
export class AtlasRenderer{
 constructor(canvas,data,product){this.data=data;this.product=product;this.canvas=canvas;this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(30,1,1,20000);this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,powerPreference:'high-performance'});this.renderer.setClearColor(0x171717,0);this.renderer.outputColorSpace=THREE.LinearSRGBColorSpace;this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.N=innerWidth<761?12000:MAX;this.metrics={frames:0,frameMs:0,particleCount:this.N,renderer:'WebGL2 / Three.js'};this.active=-2;this.motionTime=Array(7).fill(0);this.resetTokens=Array(7).fill(0);this.prevNow=0;this.deviceDpr=devicePixelRatio;this.field={
 fieldViewport:{value:new THREE.Vector2()},fieldPointer:{value:new THREE.Vector2(-1000,-1000)},
 fieldRadius:{value:80},fieldStrength:{value:0},fieldClock:{value:0},fieldDpr:{value:this.renderer.getPixelRatio()},
 earthCameraLocal:{value:new THREE.Vector3()},
 fieldImpacts:{value:Array.from({length:IMPACT_CAPACITY},()=>new THREE.Vector4(-1000,-1000,-100,-1))},
 fieldImpactDirections:{value:Array.from({length:IMPACT_CAPACITY},()=>new THREE.Vector2())}
 };this.impacts=new ImpactField(this.field);this.pointerFollow=[new DampedValue(-1000),new DampedValue(-1000)];this.morphFollow=new DampedValue();this.poseFollow=Array(7).fill(null);this.flowFollow=new DampedValue();this.pointerTarget=new THREE.Vector2(-1000,-1000);this.pointerActive=false;this.targets=this.makeTargets();this.initCloud();this.earth=this.makeEarth();this.terrain=this.makeTerrain();this.scene.add(this.earth,this.terrain);this.scene.add(new THREE.AmbientLight(0xffffff,1.25));const light=new THREE.DirectionalLight(0xffffff,2.8);light.position.set(-500,850,1000);this.scene.add(light);this.resize();this.ray=new THREE.Raycaster();this.ray.params.Points.threshold=5;}
 initCloud(){const rand=rng(44717),pos=new Float32Array(MAX*3),grain=new Float32Array(MAX),size=new Float32Array(MAX);for(let i=0;i<MAX;i++){const az=rand()*Math.PI*2,z=rand()*2-1,r=.45+Math.pow(rand(),.5)*.55,s=Math.sqrt(1-z*z);pos[i*3]=Math.cos(az)*s*r*1.06;pos[i*3+1]=z*r*.64;pos[i*3+2]=Math.sin(az)*s*r*.42;grain[i]=rand();size[i]=.75+rand()*1.3}const stream=new Float32Array(MAX*4),waterRand=rng(93173);for(let i=0;i<MAX;i++){const normal=Math.sqrt(-2*Math.log(Math.max(.00001,waterRand())))*Math.cos(waterRand()*Math.PI*2);stream.set([(i*.618033988749895)%1,Math.max(-2.4,Math.min(2.4,normal))*(i%17===0?.035:.023)+(i%7-3)*.003,(waterRand()-.5)*.012,.86+waterRand()*.28],i*4)}const path=createInfinityPath();this.flowTexture=new THREE.DataTexture(path.pixels,path.size,1,THREE.RGBAFormat,THREE.FloatType);this.flowTexture.minFilter=THREE.NearestFilter;this.flowTexture.magFilter=THREE.NearestFilter;this.flowTexture.needsUpdate=true;const g=new THREE.BufferGeometry();g.setAttribute('stream',new THREE.BufferAttribute(stream,4));g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('target',new THREE.BufferAttribute(new Float32Array(MAX*3),3));g.setAttribute('shade',new THREE.BufferAttribute(new Float32Array(MAX).fill(.8),1));g.setAttribute('phase',new THREE.BufferAttribute(new Float32Array(MAX),1));g.setAttribute('grain',new THREE.BufferAttribute(grain,1));g.setAttribute('size',new THREE.BufferAttribute(size,1));g.setDrawRange(0,this.N);this.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:true,uniforms:{...this.field,flowPath:{value:this.flowTexture},flowMix:{value:0},flowScale:{value:1},flowAnchor:{value:new THREE.Vector2()},earthScene:{value:0},cameraWorld:{value:new THREE.Vector3()},viewport:{value:new THREE.Vector2()},morph:{value:0},clock:{value:0},entity:{value:0},retain:{value:.1},dpr:{value:this.renderer.getPixelRatio()},cloudScale:{value:250},anchor:{value:new THREE.Vector2()},targetScale:{value:600},objectTransform:{value:new THREE.Matrix4()}}});this.points=new THREE.Points(g,this.material);this.points.frustumCulled=false;this.points.renderOrder=3;this.scene.add(this.points);}
 makeTargets(){const out=[],D=this.data;for(let scene=0;scene<7;scene++){const rand=rng(1771+scene),pts=new Float32Array(MAX*3),shades=new Float32Array(MAX),phases=new Float32Array(MAX);let logoPath;if(scene===6)logoPath=document.querySelector('.identity .graphic path');let total=logoPath?.getTotalLength();const weights=scene===2?D.population.map(d=>d.value):null;let sum=weights?.reduce((a,b)=>a+b,0);for(let i=0;i<MAX;i++){let p=[0,0,0],c=.8;if(scene===0){let raw=this.product.points,index=(i% (raw.length/3))*3;p=[raw[index],raw[index+1],(raw[index+2]-.5)*.015];c=raw[index+2];phases[i]=p[1]<-.025?1:0;}else if(scene===1){let d=D.penguins[i%D.penguins.length],dx,dy;if(d.species==='Gentoo'){dx=(rand()-.5)*8.4;dy=(rand()-.5)*8.4;}else if(d.species==='Chinstrap'){let a=Math.sqrt(rand()),b=rand();dx=(2*b-1)*5.2*a;dy=-5.2+9.4*a;}else{let a=rand()*6.283,r=Math.sqrt(rand())*4.2;dx=Math.cos(a)*r;dy=Math.sin(a)*r;}p=[(plotX(d.flipper_mm,165,240)+dx-360)/720,(280-plotY(d.mass_g,2500,6500)-dy)/720,0];c={Adelie:.60,Chinstrap:.82,Gentoo:.95}[d.species];}else if(scene===2){let pick=rand()*sum,k=0;while(k<7&&pick>weights[k])pick-=weights[k++];let d=D.population[k],w=d.value/1.6e9*(603-138);p=[(138+rand()*w-360)/720,(280-(48+k*48+rand()*28))/720,0];c=k<2?.9:.68;}else if(scene===3){if(i%13===0){let d=D.earthquakes[i%D.earthquakes.length];p=geoPoint(d.lat,d.lon,.314);c=.95;}else if(i%4===0){let y=1-2*((i*.754877666)%1),a=((i*.61803398875)%1)*Math.PI*2,r=Math.sqrt(1-y*y);p=[r*Math.cos(a)*.311,y*.311,r*Math.sin(a)*.311];c=.23+rand()*.07;}else{let k=(i%(D.earthLand.length/2))*2;p=geoPoint(D.earthLand[k],D.earthLand[k+1],.312);c=.40+rand()*.23;}}else if(scene===4){let k=i<D.temperature.length?Math.min(i,D.temperature.length-2):Math.floor(rand()*(D.temperature.length-1)),a=D.temperature[k],b=D.temperature[k+1],r=i<D.temperature.length?(i===D.temperature.length-1?1:0):rand(),x=plotX(a.year+(b.year-a.year)*r,1880,2025,80,655),y=plotY(a.anomaly+(b.anomaly-a.anomaly)*r,-.6,1.4,48,450);p=[(x-360)/720,(280-y+(rand()-.5)*1.5)/720,0];c=.7+rand()*.25;}else if(scene===5){const t=D.terrain;let k;do{k=Math.floor(rand()*t.elevations_m.length)}while(rand()>.28+.72*(t.elevations_m[k]-t.min_m)/(t.max_m-t.min_m));p=t.positions.slice(k*3,k*3+3);c=.35+.6*(t.elevations_m[k]-t.min_m)/(t.max_m-t.min_m);}else{const s=logoPath.getPointAtLength(rand()*total),a=rand()*6.283,r=Math.sqrt(rand())*10;p=[(s.x+Math.cos(a)*r-360)/720,(280-s.y-Math.sin(a)*r)/720,0];c=.65+rand()*.3;}pts.set(p,i*3);shades[i]=c}out.push({pts,shades,phases})}return out;}
 makeEarth(){const group=new THREE.Group();const sphere=new THREE.Mesh(new THREE.SphereGeometry(.308,64,40),attachField(new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true}),this.field));group.add(sphere);this.globeOccluder=sphere;let pos=[];for(let line of this.data.coastlines){for(let i=0;i+3<line.length;i+=2){pos.push(...geoPoint(line[i+1],line[i],.312),...geoPoint(line[i+3],line[i+2],.312))}}const coast=new THREE.BufferGeometry();coast.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));group.add(new THREE.Points(coast,attachField(new THREE.PointsMaterial({color:0x626262,size:.65,transparent:true,opacity:.4,depthWrite:false}),this.field,{points:true,earth:true})));const epos=[],sizes=[];for(let d of this.data.earthquakes){epos.push(...geoPoint(d.lat,d.lon,.316));sizes.push(d.mag>=6?6:d.mag>=5?4.4:3)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(epos,3));g.setAttribute('diameter',new THREE.Float32BufferAttribute(sizes,1));const eventSeeds=new Float32Array(sizes.length);for(let i=0;i<sizes.length;i++){const a=g.attributes.position;eventSeeds[i]=particleSeed(a.getX(i),a.getY(i),a.getZ(i))}g.setAttribute('eventSeed',new THREE.BufferAttribute(eventSeeds,1));const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,uniforms:{...this.field,dpr:{value:Math.min(devicePixelRatio,1.75)},opacity:{value:1}},
vertexShader:`attribute float diameter;attribute float eventSeed;uniform float dpr;${fieldVertex}${earthVisibility}
void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=diameter*dpr;
vEarthVisible=step(0.,dot(normalize(position),earthCameraLocal-position));
applyParticleField(gl_Position,eventSeed,gl_PointSize/fieldDpr,.55);}`,
fragmentShader:`uniform float opacity;varying float vEarthVisible;${fieldFragment}
void main(){maskParticleHole();if(vEarthVisible<.5)discard;float d=length(gl_PointCoord*2.-1.);if(d>1.)discard;gl_FragColor=vec4(vec3(.96)*vFieldTwinkle,opacity*(1.-smoothstep(.6,1.,d)));}`});this.events=new THREE.Points(g,mat);this.events.renderOrder=4;group.add(this.events);this.eventLocal=epos;group.visible=false;return group;}
 makeTerrain(){const t=this.data.terrain,group=new THREE.Group(),g=new THREE.BufferGeometry(),pos=new Float32Array(t.positions),colors=new Float32Array(pos.length),idx=[];for(let i=0;i<t.elevations_m.length;i++){let c=.18+.24*(t.elevations_m[i]-t.min_m)/(t.max_m-t.min_m);colors.set([c,c,c],i*3)}for(let row=0;row<t.height-1;row++)for(let col=0;col<t.width-1;col++){let k=row*t.width+col;idx.push(k,k+t.width,k+1,k+1,k+t.width,k+t.width+1)}g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();const mesh=new THREE.Mesh(g,attachField(new THREE.MeshBasicMaterial({side:THREE.DoubleSide,colorWrite:false,depthWrite:true}),this.field));mesh.position.y=-.0007;group.add(mesh);this.terrainMesh=mesh;let segments=[];for(let line of(t.contours||[]))segments.push(...line);const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));const contour=new THREE.Points(cg,attachField(new THREE.PointsMaterial({color:0x888888,size:.65,transparent:true,opacity:.28,depthWrite:false}),this.field,{points:true}));contour.position.y=.0004;group.add(contour);const bottom=-.02;const verts=t.positions;const corners=[verts.slice(0,3),verts.slice((t.width-1)*3,t.width*3),verts.slice((t.width*t.height-1)*3,t.width*t.height*3),verts.slice((t.width*(t.height-1))*3,(t.width*(t.height-1)+1)*3)];let edge=[];for(let i=0;i<4;i++){let a=corners[i],b=corners[(i+1)%4];edge.push(a[0],bottom,a[2],b[0],bottom,b[2]);edge.push(a[0],bottom,a[2],a[0],a[1],a[2])}const eg=new THREE.BufferGeometry();eg.setAttribute('position',new THREE.Float32BufferAttribute(edge,3));group.visible=false;return group;}
 resize(){const dpr=Math.min(devicePixelRatio,1.75);this.renderer.setPixelRatio(dpr);this.metrics.dpr=dpr;this.material.uniforms.dpr.value=dpr;this.events.material.uniforms.dpr.value=dpr;this.renderer.setSize(innerWidth,innerHeight,false);this.camera.aspect=innerWidth/innerHeight;this.camera.position.set(0,0,innerHeight/(2*Math.tan(Math.PI/12)));this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();this.material.uniforms.viewport.value.set(innerWidth,innerHeight);const heightChange=innerHeight-this.field.fieldViewport.value.y;this.impacts.resize(heightChange);this.pointerFollow[1].value+=heightChange;this.pointerTarget.y+=heightChange;this.field.fieldPointer.value.y+=heightChange;this.field.fieldViewport.value.set(innerWidth,innerHeight);this.field.fieldRadius.value=Math.max(42,Math.min(90,Math.min(innerWidth,innerHeight)*.105))*.25;this.field.fieldDpr.value=dpr;this.material.uniforms.cameraWorld.value.copy(this.camera.position);this.material.uniforms.cloudScale.value=Math.min(innerWidth,innerHeight)*.32;}
 render(state,now){const dt=this.prevNow?Math.min((now-this.prevNow)*.001,.05):0;this.prevNow=now;if(state.index>=0){const i=state.index,r=state.rotation;if((r.resetToken||0)!==this.resetTokens[i]){this.motionTime[i]=0;this.resetTokens[i]=r.resetToken||0}if(state.morph>.98&&state.entity>.95&&!r.userControlled)this.motionTime[i]+=dt;}if(this.deviceDpr!==devicePixelRatio){this.deviceDpr=devicePixelRatio;this.resize()}if(this.active!==state.index){this.active=state.index;this.morphFollow.snap(state.morph);this.flowFollow.snap(state.buffer?.mix||0);if(state.index>=0){const t=this.targets[state.index];this.points.geometry.setAttribute('target',new THREE.BufferAttribute(t.pts,3));this.points.geometry.setAttribute('shade',new THREE.BufferAttribute(t.shades,1));this.points.geometry.setAttribute('phase',new THREE.BufferAttribute(t.phases,1))}}const u=this.material.uniforms;u.clock.value=now*.001;u.morph.value=clamp(this.morphFollow.step(state.morph,dt,34));u.entity.value=state.entity;u.flowMix.value=clamp(this.flowFollow.step(state.buffer?.mix||0,dt,28));this.updateField(dt,now);u.flowScale.value=Math.min(innerWidth*.34,innerHeight*.36,410);if(state.buffer?.index>=0)u.flowAnchor.value.set(0,innerHeight/2-state.buffer.centerY-Math.min(20,innerHeight*.024));this.metrics.flow={index:state.buffer?.index??-1,mix:u.flowMix.value,effectiveMix:u.flowMix.value*(1.-u.morph.value),cyclesPerSecond:FLOW_RATE,scale:u.flowScale.value,center:[innerWidth/2,innerHeight/2-u.flowAnchor.value.y],clock:now*.001,direction:'centre > lower right > upper right > centre > lower left > upper left'};u.earthScene.value=state.index===3?1:0;u.retain.value=state.index===3?.72:.88;const r=state.rect||{left:0,top:0,width:innerWidth,height:innerHeight};let x=r.left+r.width/2-innerWidth/2,y=innerHeight/2-r.top-r.height/2,scale=r.width;let rotation=new THREE.Euler(),t=this.motionTime[state.index]||0,live=state.entity>.95;if(state.index===0){rotation.set(Math.sin(t*.22)*.018,Math.sin(t*.27)*.075,Math.sin(t*.2)*.018);y+=Math.sin(t*.4)*Math.min(7,scale*.012);}else if(state.index===6){rotation.z=Math.sin(t*.22)*.012;}if(state.index===3){const d=state.rotation;rotation.set(EARTH_ROT[0]+d.x,EARTH_ROT[1]+d.y+(!d.userControlled?t*.026:0),0);y+=10/720*scale;}else if(state.index===5){let d=state.rotation;rotation.set(TERRAIN_ROT[0]+d.x+(!d.userControlled?Math.sin(t*.22)*.035:0),TERRAIN_ROT[1]+d.y+(!d.userControlled?Math.sin(t*.18)*.14:0),0);y-=20/720*scale;scale*=420/720;}if(state.index>=0){let follow=this.poseFollow[state.index];if(!follow)follow=this.poseFollow[state.index]=[new DampedValue(rotation.x),new DampedValue(rotation.y),new DampedValue(rotation.z)];rotation.set(follow[0].step(rotation.x,dt,42),follow[1].step(rotation.y,dt,42),follow[2].step(rotation.z,dt,42));}this.metrics.inertia={requestedMorph:state.morph,renderedMorph:u.morph.value,morphVelocity:this.morphFollow.velocity,pointerVelocity:this.pointerFollow.map(f=>f.velocity)};u.anchor.value.set(x,y);u.targetScale.value=scale;u.objectTransform.value.makeRotationFromEuler(rotation);for(let[group,idx]of[[this.earth,3],[this.terrain,5]]){group.visible=state.index===idx&&state.entity>.015;group.position.set(x,y,0);group.scale.setScalar(scale);group.rotation.copy(rotation);if(group.visible)group.traverse(o=>{if(o.material&&o!==this.events){o.material.opacity=state.entity*(o.isLineSegments?.45:1)}if(o===this.events)o.material.uniforms.opacity.value=state.entity;})}this.scene.updateMatrixWorld(true);this.field.earthCameraLocal.value.copy(this.camera.position);this.earth.worldToLocal(this.field.earthCameraLocal.value);this.renderer.render(this.scene,this.camera);this.metrics.frames++;this.metrics.motion={index:state.index,seconds:t,rotation:[rotation.x,rotation.y,rotation.z],clock:now*.001};}
 setPointer(clientX,clientY,strike=true){
  // Mouse and pen updates do not capture pointers or interfere with scrolling.
  const time=performance.now()*.001;
  if(strike)this.impacts.move(clientX,innerHeight-clientY,time,this.field.fieldRadius.value);
  else this.impacts.seed(clientX,innerHeight-clientY,time);
  this.pointerTarget.set(clientX,innerHeight-clientY);
  if(!this.pointerActive&&this.field.fieldStrength.value<.01){this.field.fieldPointer.value.copy(this.pointerTarget);this.pointerFollow[0].snap(this.pointerTarget.x);this.pointerFollow[1].snap(this.pointerTarget.y);}
  this.pointerActive=true;
 }
 clearPointer(immediate=false){
  this.pointerActive=false;this.impacts.release(immediate);
  if(immediate){this.pointerFollow.forEach(f=>f.velocity=0);this.field.fieldStrength.value=0;if(this.metrics.field){this.metrics.field.strength=0;this.metrics.field.impactCount=0;this.metrics.field.latestImpact=null;}}
 }
 updateField(dt,now){
  const f=this.field,desired=this.pointerActive?1:0;
  f.fieldClock.value=now*.001;
  f.fieldPointer.value.set(this.pointerFollow[0].step(this.pointerTarget.x,dt,50),this.pointerFollow[1].step(this.pointerTarget.y,dt,50));
  f.fieldStrength.value+=(desired-f.fieldStrength.value)*(1-Math.exp(-(desired?12:6)*dt));
  if(!desired&&f.fieldStrength.value<.002)f.fieldStrength.value=0;
  const impact=this.impacts.metrics(now*.001);
  this.metrics.field={impactCount:impact.count,latestImpact:impact.latest,pointer:[f.fieldPointer.value.x,innerHeight-f.fieldPointer.value.y],radius:f.fieldRadius.value,mode:'repel',strength:f.fieldStrength.value,active:this.pointerActive,clock:now*.001,ambientDrift:true,twinkle:true};
 }
 pickEarth(clientX,clientY){
  if(!this.earth.visible)return null;
  const localCamera=this.field.earthCameraLocal.value,positions=this.events.geometry.attributes.position,
    diameters=this.events.geometry.attributes.diameter,p=new THREE.Vector3();
  let selected=null,nearest=Infinity;
  for(let i=0;i<positions.count;i++){
   p.fromBufferAttribute(positions,i);
   if(p.dot(localCamera)-p.lengthSq()<=0)continue;
   const seed=this.events.geometry.attributes.eventSeed.getX(i),diameter=diameters.getX(i);
   p.applyMatrix4(this.events.matrixWorld).project(this.camera);
   const pixel=displaceParticlePixel((p.x*.5+.5)*innerWidth,(p.y*.5+.5)*innerHeight,seed,diameter,this.field);
   const distance=Math.hypot(pixel[0]-clientX,innerHeight-pixel[1]-clientY);
   if(distance<Math.max(4,diameter*.5+3)&&distance<nearest){nearest=distance;selected=this.data.earthquakes[i]}
  }
  return selected;
 }
 setBudget(n){this.N=Math.max(6000,Math.min(MAX,n));this.points.geometry.setDrawRange(0,this.N);this.metrics.particleCount=this.N;}
 destroy(){this.flowTexture.dispose();this.renderer.dispose();}
}
