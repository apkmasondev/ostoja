import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Distant forest on the far shore, generated at load time.
// Trees grow in patches (value-noise mask) with meadows between them, only where
// they can actually be seen from the house, and are drawn as a few instanced
// batches per spatial chunk so off-screen chunks are frustum-culled.

function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function hash(x,y){const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s);}
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),f=x-i,g=y-j,u=f*f*(3-2*f),v=g*g*(3-2*g);
 return (hash(i,j)*(1-u)+hash(i+1,j)*u)*(1-v)+(hash(i,j+1)*(1-u)+hash(i+1,j+1)*u)*v;}
function fbm(x,y){return noise(x,y)*.55+noise(x*2.1+7.3,y*2.1-3.1)*.3+noise(x*4.3-1.7,y*4.3+5.2)*.15;}

// Height field of the far ridges, rasterised once from their triangles (max = visible surface).
class HeightField{
 constructor(meshes,{x0=-900,x1=900,z0=-540,z1=-120,cell=3}={}){
  Object.assign(this,{x0,z0,cell});this.nx=Math.ceil((x1-x0)/cell)+1;this.nz=Math.ceil((z1-z0)/cell)+1;
  this.h=new Float32Array(this.nx*this.nz).fill(-Infinity);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(const mesh of meshes){
   mesh.updateWorldMatrix(true,false);const pos=mesh.geometry.attributes.position,index=mesh.geometry.index;
   const count=index?index.count:pos.count,vertex=i=>index?index.getX(i):i;
   for(let t=0;t<count;t+=3){
    a.fromBufferAttribute(pos,vertex(t)).applyMatrix4(mesh.matrixWorld);b.fromBufferAttribute(pos,vertex(t+1)).applyMatrix4(mesh.matrixWorld);c.fromBufferAttribute(pos,vertex(t+2)).applyMatrix4(mesh.matrixWorld);
    this.fill(a,b,c);
   }
  }
 }
 fill(a,b,c){
  const i0=Math.max(0,Math.floor((Math.min(a.x,b.x,c.x)-this.x0)/this.cell)),i1=Math.min(this.nx-1,Math.ceil((Math.max(a.x,b.x,c.x)-this.x0)/this.cell));
  const j0=Math.max(0,Math.floor((Math.min(a.z,b.z,c.z)-this.z0)/this.cell)),j1=Math.min(this.nz-1,Math.ceil((Math.max(a.z,b.z,c.z)-this.z0)/this.cell));
  const d=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(d)<1e-9)return;
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const x=this.x0+i*this.cell,z=this.z0+j*this.cell;
   const w1=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/d,w2=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/d,w3=1-w1-w2;
   if(w1<-1e-4||w2<-1e-4||w3<-1e-4)continue;
   const y=w1*a.y+w2*b.y+w3*c.y,k=j*this.nx+i;if(y>this.h[k])this.h[k]=y;
  }
 }
 at(x,z){
  const fx=(x-this.x0)/this.cell,fz=(z-this.z0)/this.cell,i=Math.floor(fx),j=Math.floor(fz);
  if(i<0||j<0||i>=this.nx-1||j>=this.nz-1)return -Infinity;
  const k=j*this.nx+i,h00=this.h[k],h10=this.h[k+1],h01=this.h[k+this.nx],h11=this.h[k+this.nx+1];
  if(!isFinite(h00+h10+h01+h11))return Math.max(h00,h10,h01,h11);
  const u=fx-i,v=fz-j;return (h00*(1-u)+h10*u)*(1-v)+(h01*(1-u)+h11*u)*v;
 }
 visible(from,x,y,z){
  const steps=40;for(let s=1;s<steps;s++){const t=s/steps,px=from.x+(x-from.x)*t,pz=from.z+(z-from.z)*t;if(this.at(px,pz)>from.y+(y-from.y)*t+.4)return false;}return true;
 }
}

// ---- tree models (unit height, crown colours baked into vertex colours) ----
function paint(geometry,dark,light,y0=0,y1=1,random){
 geometry=geometry.index?geometry.toNonIndexed():geometry;const p=geometry.attributes.position,colors=new Float32Array(p.count*3),c=new THREE.Color();
 for(let i=0;i<p.count;i++){const t=THREE.MathUtils.clamp((p.getY(i)-y0)/(y1-y0),0,1);c.copy(dark).lerp(light,Math.pow(t,.8));const n=.9+random()*.2;colors.set([c.r*n,c.g*n,c.b*n],i*3);}
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry;
}
function jitter(geometry,amount,random,keepY=false){const p=geometry.attributes.position;for(let i=0;i<p.count;i++){p.setX(i,p.getX(i)*(1+(random()-.5)*amount));p.setZ(i,p.getZ(i)*(1+(random()-.5)*amount));if(!keepY)p.setY(i,p.getY(i)+(random()-.5)*amount*.08);}return geometry;}
function trunk(r,h,random){return paint(new THREE.CylinderGeometry(r*.7,r,h,5,1,true).translate(0,h/2,0),new THREE.Color(.05,.035,.025),new THREE.Color(.11,.08,.05),0,h,random);}
function blob(r,x,y,z,sy,random,dark,light,detail=1){
 const g=new THREE.IcosahedronGeometry(r,detail);const p=g.attributes.position;
 for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i),k=1+(noise(v.x*9+x*3,v.y*9+z*3)-.5)*.45;p.setXYZ(i,v.x*k,v.y*k*sy,v.z*k);}
 g.translate(x,y,z);const out=paint(g,dark,light,y-r*sy,y+r*sy,random);out.computeVertexNormals();
 // Rounded crowns: normals from the blob centre read as foliage, not facets.
 const n=out.attributes.normal,q=out.attributes.position;for(let i=0;i<q.count;i++){const v=new THREE.Vector3(q.getX(i)-x,(q.getY(i)-y)/sy,q.getZ(i)-z).normalize();n.setXYZ(i,v.x,v.y,v.z);}
 return out;
}
function spruce(random){
 const parts=[trunk(.018,.25,random)],tiers=5,dark=new THREE.Color(.018,.045,.03),light=new THREE.Color(.05,.1,.06);
 for(let i=0;i<tiers;i++){const t=i/tiers,base=.1+t*.74,h=.32-t*.1,r=(.21*(1-t*.85))+.02;
  const c=jitter(new THREE.ConeGeometry(r,h,7,1,true).translate(0,base+h/2,0),.35,random,true);parts.push(paint(c,dark,light,.1,1,random));}
 return mergeGeometries(parts);
}
function pine(random){
 // Scots pine: bare upper trunk, irregular flat-topped crown of several clumps.
 const dark=new THREE.Color(.03,.05,.028),light=new THREE.Color(.08,.11,.055),parts=[trunk(.016,.66,random)];
 for(let i=0;i<4;i++){const a=i/4*Math.PI*2+random(),d=i?.08+random()*.06:0;parts.push(blob(.12+random()*.05,Math.cos(a)*d,.66+random()*.2,Math.sin(a)*d,.72,random,dark,light,0));}
 return mergeGeometries(parts);
}
function broadleaf(random){
 const dark=new THREE.Color(.04,.062,.028),light=new THREE.Color(.105,.135,.06);
 return mergeGeometries([trunk(.03,.35,random),blob(.3,0,.62,0,.9,random,dark,light),blob(.22,.16,.48,.1,.85,random,dark,light,0),blob(.21,-.15,.5,-.1,.85,random,dark,light,0)]);
}

export function createForest({ridges,viewpoint,count=2600,seed=7,layer=0}){
 const field=new HeightField(ridges),random=rng(seed);
 const species=[
  {name:'spruce',geometry:spruce(random),height:[6,10.5],width:[.8,1.15],tint:[.85,1.15]},
  {name:'pine',geometry:pine(random),height:[6.5,9.5],width:[.9,1.25],tint:[.9,1.2]},
  {name:'broadleaf',geometry:broadleaf(random),height:[5,8],width:[.9,1.3],tint:[.85,1.25]}
 ];
 const placed=species.map(()=>[]),chunk=240;let attempts=0,total=0;
 while(total<count&&attempts<count*40){
  attempts++;
  const x=(random()*2-1)*760,z=-150-random()*360,ground=field.at(x,z);
  if(!isFinite(ground)||ground<.4)continue;
  // Forest patches with meadows; denser on upper slopes, thinner by the water.
  const patch=fbm(x/140,z/110),slope=THREE.MathUtils.smoothstep(ground,.4,9);
  if(random()>THREE.MathUtils.smoothstep(patch,.47,.6)*(.4+.6*slope))continue;
  const kind=noise(x/60+40,z/60)<.4+.3*(1-slope)?2:(random()<.22?1:0),s=species[kind];
  const height=THREE.MathUtils.lerp(s.height[0],s.height[1],random())*(.8+.2*slope);
  if(!field.visible(viewpoint,x,ground+height*.55,z))continue;
  placed[kind].push({x,y:ground-.6,z,height,width:THREE.MathUtils.lerp(s.width[0],s.width[1],random()),rot:random()*Math.PI*2,tilt:(random()-.5)*.06,tint:THREE.MathUtils.lerp(s.tint[0],s.tint[1],random()),hue:(random()-.5)*.04});
  total++;
 }
 const group=new THREE.Group();group.name='Runtime forest';
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,metalness:0,envMapIntensity:.6});
 const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),color=new THREE.Color();
 species.forEach((s,kind)=>{
  const chunks=new Map();for(const t of placed[kind]){const key=Math.floor(t.x/chunk);if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(t);}
  for(const [key,trees] of chunks){
   const mesh=new THREE.InstancedMesh(s.geometry,material,trees.length);mesh.name=`Forest_${s.name}_${key}`;
   trees.forEach((t,i)=>{e.set(t.tilt,t.rot,t.tilt*.5);q.setFromEuler(e);m.compose(new THREE.Vector3(t.x,t.y,t.z),q,new THREE.Vector3(t.height*t.width,t.height,t.height*t.width));mesh.setMatrixAt(i,m);color.setRGB(t.tint,t.tint,t.tint).offsetHSL(t.hue,0,0);mesh.setColorAt(i,color);});
   mesh.computeBoundingSphere();mesh.layers.set(layer);mesh.castShadow=mesh.receiveShadow=false;group.add(mesh);
  }
 });
 group.userData.stats={trees:total,attempts,spruce:placed[0].length,pine:placed[1].length,broadleaf:placed[2].length,triangles:placed.reduce((sum,list,k)=>sum+list.length*species[k].geometry.attributes.position.count/3,0)};
 return group;
}
