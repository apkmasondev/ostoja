import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {QualityController,qualitySettings} from './quality.js';
import {pickWalkDestination} from './picking.js';
import {createForest} from './forest.js';

const $=s=>document.querySelector(s),video=$('#intro'),canvas=$('#scene');
const mobile=matchMedia('(pointer:coarse)').matches;
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
if(mobile)document.body.classList.add('touch-ui');
function setStatus(t){$('#loading').textContent=t;}
function fail(t){setStatus(t);$('#begin').hidden=true;$('.lede').hidden=true;}
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});}catch(e){fail('Ta przeglądarka nie obsługuje WebGL 2. Otwórz dom w aktualnym Chrome, Safari lub Firefox.');throw e;}
const maxPixelRatio=Math.min(devicePixelRatio,mobile?1.25:1.7),minPixelRatio=Math.min(maxPixelRatio,mobile?.8:1);let pixelRatio=maxPixelRatio;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.88;
// Warstwa 0: krajobraz odbijany w jeziorze. Warstwa 1: dom, roślinność i detale (bez odbicia, żeby nie renderować sceny dwa razy).
const REFLECTED=0,DETAIL=1;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x9a948f,.0034);const portalScene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(44,innerWidth/innerHeight,.05,600);camera.layers.enable(DETAIL);
const entry=new THREE.Vector3(1.04,1.81,2.85);camera.position.copy(entry);camera.lookAt(1.04,1.81,0);
const initialQ=camera.quaternion.clone();
// Bright-pixel centroid measured from sunset.hdr; the same rotation drives
// the visible sun, direct illumination, environment and water highlight.
const skyRotation=2.65;
const sunDirection=new THREE.Vector3(.8039986854,.107172425,.5848933109).applyAxisAngle(new THREE.Vector3(0,1,0),skyRotation).normalize();
const hemi=new THREE.HemisphereLight(0xe6c9a8,0x58402c,.65);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffd09b,3.3);sun.target.position.set(0,0,-5);sun.position.copy(sun.target.position).addScaledVector(sunDirection,40);sun.castShadow=true;sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);sun.shadow.camera.left=-17;sun.shadow.camera.right=17;sun.shadow.camera.top=17;sun.shadow.camera.bottom=-17;sun.shadow.camera.near=1;sun.shadow.camera.far=90;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;sun.shadow.camera.layers.enableAll();scene.add(sun,sun.target);
const interiorFill=new THREE.PointLight(0xffd2a3,12,13,2);interiorFill.position.set(-1,3.1,-6);scene.add(interiorFill);
const kitchenFill=new THREE.PointLight(0xffc28b,13,7,2);kitchenFill.position.set(-1.10,2.6,-3.0);scene.add(kitchenFill);
const counterFill=new THREE.PointLight(0xffcc95,8,5,2);counterFill.position.set(-2.7,2.6,-3.25);scene.add(counterFill);
const fireLight=new THREE.PointLight(0xff7b32,3.2,3,2);fireLight.position.set(-2.6,1,-6.6);scene.add(fireLight);
const flameUniform={time:{value:0}};const flameMaterial=new THREE.ShaderMaterial({uniforms:flameUniform,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,vertexShader:`varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 v;uniform float time;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}void main(){float n=noise(vec2(v.x*9.,v.y*5.-time*1.8));float tongues=sin(v.x*24.+sin(time*2.))* .12;float shape=(1.-v.y)-abs(v.x-.5)*1.5+n*.33+tongues;float alpha=smoothstep(.18,.42,shape)*smoothstep(0.,.12,v.y)*(1.-v.y);vec3 c=mix(vec3(1.8,.18,.005),vec3(3.,1.5,.25),pow(1.-v.y,3.));gl_FragColor=vec4(c,alpha*.7);}`});
const flames=new THREE.Mesh(new THREE.PlaneGeometry(.92,.58),flameMaterial);flames.position.set(-2.63,1.01,-6.66);flames.rotation.y=Math.PI/2;flames.layers.set(DETAIL);scene.add(flames);
for(const x of [-.43,2.48]){const l=new THREE.SpotLight(0xffb965,9,5,Math.PI/3,.75,2);l.position.set(x,2.26,.34);l.target.position.set(x,.5,.1);scene.add(l,l.target);}
const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{sunDirection:{value:sunDirection}},vertexShader:`varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vPos;uniform vec3 sunDirection;void main(){vec3 p=normalize(vPos);float h=clamp(p.y,0.,1.);vec3 low=vec3(.94,.66,.40);vec3 high=vec3(.28,.36,.47);vec3 col=mix(low,high,pow(h,.45));float d=distance(p,sunDirection);col+=vec3(1.,.61,.23)*exp(-d*8.)*.46;col+=vec3(1.,.92,.65)*smoothstep(.016,.009,d)*3.;float cloud=sin(p.x*24.+p.z*12.+sin(p.x*9.))*sin(p.z*31.-p.x*6.);col=mix(col,vec3(.55,.46,.45),max(0.,cloud-.3)*.24*smoothstep(.06,.35,h));gl_FragColor=vec4(col,1.);}`});
const sky=new THREE.Mesh(new THREE.SphereGeometry(450,48,24),skyMaterial);scene.add(sky);
new HDRLoader().load('assets/sunset.hdr',texture=>{texture.mapping=THREE.EquirectangularReflectionMapping;sky.visible=false;scene.background=texture;scene.backgroundIntensity=.38;scene.backgroundRotation.y=skyRotation;scene.environment=texture;scene.environmentIntensity=.30;scene.environmentRotation.y=skyRotation;reflectionDirty=true;},undefined,()=>{});
const pmrem=new THREE.PMREMGenerator(renderer);const envScene=new THREE.Scene();envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100,32,16),skyMaterial.clone()));scene.environment=pmrem.fromScene(envScene,.025).texture;scene.environmentIntensity=.5;pmrem.dispose();

// Jezioro: prawdziwe lustrzane odbicie krajobrazu i nieba, zniekształcone falami, z efektem Fresnela i ścieżką słońca.
const WaterShader={name:'LakeWater',
 uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null},time:{value:0},sunDirection:{value:sunDirection},fogColor:{value:scene.fog.color},fogDensity:{value:scene.fog.density}},
 vertexShader:`uniform mat4 textureMatrix;varying vec4 vUv;varying vec3 vWorld;void main(){vUv=textureMatrix*vec4(position,1.);vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`uniform sampler2D tDiffuse;uniform float time,fogDensity;uniform vec3 sunDirection,fogColor;varying vec4 vUv;varying vec3 vWorld;
 vec2 wave(vec2 p,vec2 d,float k,float a,float s){return d*(a*k*cos(k*dot(d,p)+s*time));}
 void main(){
  vec3 toEye=cameraPosition-vWorld;float dist=length(toEye);vec3 V=toEye/dist;vec2 p=vWorld.xz;
  vec2 g=wave(p,vec2(.8,.6),1.1,.035,.9)+wave(p,vec2(-.45,.89),1.9,.02,1.3)+wave(p,vec2(.97,-.24),3.7,.009,2.1)+wave(p,vec2(-.2,-.98),7.3,.004,2.9)+wave(p,vec2(.6,.8),13.,.0018,3.7);
  g*=1./(1.+dist*.015);
  vec3 n=normalize(vec3(-g.x,1.,-g.y));
  vec2 offset=n.xz*(.018+.9/max(dist,1.));
  vec3 refl=texture2D(tDiffuse,vUv.xy/vUv.w+offset).rgb;
  float F=.02+.98*pow(1.-max(dot(n,V),0.),5.);
  vec3 body=vec3(.012,.026,.024);
  vec3 col=mix(body,refl,clamp(F*1.15,0.,1.));
  vec3 R=reflect(-V,n);float s=max(dot(R,sunDirection),0.);
  col+=vec3(1.,.70,.42)*(pow(s,520.)*3.2+pow(s,45.)*.12);
  float f=1.-exp(-fogDensity*fogDensity*dist*dist);col=mix(col,fogColor,f);
  gl_FragColor=vec4(col,1.);
 }`};
let reflector,reflectedFrame=-1,frameNumber=0,reflectionDirty=true,reflectionRenders=0;
const quality=new QualityController();let renderQuality=qualitySettings(0,mobile,maxPixelRatio,minPixelRatio);
function reflectionSize(){const s=new THREE.Vector2();renderer.getDrawingBufferSize(s);return s.multiplyScalar(renderQuality.reflectionScale).floor().max(new THREE.Vector2(1,1));}
function createLake(source){
 const box=new THREE.Box3().setFromObject(source),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),rt=reflectionSize();
 reflector=new Reflector(new THREE.PlaneGeometry(size.x,size.z),{shader:WaterShader,textureWidth:rt.x,textureHeight:rt.y,clipBias:.003,multisample:0});
 reflector.rotation.x=-Math.PI/2;reflector.position.set(center.x,box.max.y,center.z);reflector.receiveShadow=false;
 // Odbicie renderujemy raz na klatkę (SSAO renderuje scenę drugi raz i wywołałoby je ponownie).
 const renderReflection=reflector.onBeforeRender;
 const lastPosition=new THREE.Vector3(Infinity,0,0),lastQuaternion=new THREE.Quaternion(),lastProjection=new THREE.Matrix4();let lastReflection=0;
 reflector.onBeforeRender=function(r,s,c){
  if(reflectedFrame===frameNumber||s.overrideMaterial)return;
  const now=performance.now(),changed=lastPosition.distanceToSquared(c.position)>1e-9||1-Math.abs(lastQuaternion.dot(c.quaternion))>1e-9||!lastProjection.equals(c.projectionMatrix);
  if(!reflectionDirty&&(!changed||now-lastReflection<renderQuality.reflectionInterval))return;
  reflectedFrame=frameNumber;renderReflection.call(this,r,s,c);reflectionRenders++;
  lastPosition.copy(c.position);lastQuaternion.copy(c.quaternion);lastProjection.copy(c.projectionMatrix);lastReflection=now;reflectionDirty=false;
 };
 source.visible=false;scene.add(reflector);
}

const composerTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:mobile?2:4});
const composer=new EffectComposer(renderer,composerTarget);composer.addPass(new RenderPass(scene,camera));
const ao=new SSAOPass(scene,camera,innerWidth,innerHeight,24);ao.kernelRadius=.55;ao.minDistance=.000018;ao.maxDistance=.003;
if(!mobile)composer.addPass(ao);
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.045,.45,2.0);composer.addPass(bloom);composer.addPass(new OutputPass());

let ready=false,failed=false,state='welcome',door,portal,portalHinge,portalMats=[],transitionStart=0,walkStart=0,current=0,exploreStart=0,fadeTimer,videoFailed=!!video.error;
let yaw=0,pitch=0,dragging=false,dragMoved=0,lastX=0,lastY=0,keys=new Set(),clock=new THREE.Clock(),frameAverage=1/60,mainRenders=0;
const pickMeshes=[];
const stops=[
 {name:'Próg',pos:[1.28,2.09,-1.18],look:[.2,1.75,-7]},
 {name:'Salon',pos:[-.6,2.09,-4.9],look:[-1,1.5,-8]},
 {name:'Nad jeziorem',pos:[.9,2.09,-9.25],look:[-5,2.0,-35]},
 {name:'Taras',pos:[.9,2.09,-11.6],look:[-8,2.0,-38]},
 {name:'Kuchnia',pos:[.40,2.09,-4.9],look:[-2.7,1.7,-3.0]}
];
let walkCurve,walkFromQ,walkToQ,walkDuration=6500;
const stopButtons=stops.map((stop,i)=>{const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.innerHTML=`<b>0${i+1}</b>${stop.name}`;b.onclick=()=>walkTo(i);li.append(b);$('#stops').append(li);return b;});
function markStop(i){current=i;stopButtons.forEach((b,j)=>{b.removeAttribute('aria-current');if(j===i)b.setAttribute('aria-current','step');});stopButtons[i].scrollIntoView({block:'nearest',inline:'nearest'});$('#tour span').textContent=`Dalej: ${stops[(i+1)%stops.length].name}`;$('#tour').setAttribute('aria-label',`Przejdź dalej: ${stops[(i+1)%stops.length].name}`);}
function leaveStop(){stopButtons.forEach(b=>b.removeAttribute('aria-current'));}
markStop(0);
function syncAngles(){const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=e.y;pitch=e.x;}

const draco=new DRACOLoader();draco.setDecoderPath('vendor/draco/');
new GLTFLoader().setDRACOLoader(draco).load('assets/house.glb',async gltf=>{
 try{
 scene.add(gltf.scene);door=gltf.scene.getObjectByName('DoorPivot');
 let lake;
 gltf.scene.traverse(o=>{o.layers.set(/Distant|Earth|Shore/.test(o.name)?REFLECTED:DETAIL);if(!o.isMesh)return;if(o.name==='Batch_Lake_water'){lake=o;return;}o.castShadow=!/glass|Lavender|Distant|Shore/i.test(o.name);o.receiveShadow=true;
  if(!/Distant|Earth|Shore|Lavender|glass/i.test(o.name))pickMeshes.push(o);
  const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(m.map)m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(/leaves/i.test(m.name)){m.side=THREE.DoubleSide;m.roughness=.9;}if(/glass/i.test(m.name)){m.transparent=true;m.opacity=.09;m.depthWrite=false;o.castShadow=false;}if(/Oiled/i.test(m.name)){m.roughness=.62;m.color.setRGB(1.13,1.01,.84);}
   // Tekstura lnu (Poly Haven rough_linen) jest niebieskoszara; korekta w przestrzeni liniowej daje ciepły, niebarwiony len jak na referencji.
   if(/Undyed/i.test(m.name)){m.color.setRGB(2.35,1.58,.9);m.roughness=1;}
   if(/jute/i.test(m.name)){m.color.setRGB(.84,.61,.36);m.roughness=1;}}
 });
 if(lake)createLake(lake);
 const ridges=[];gltf.scene.traverse(o=>{if(o.isMesh&&/Distant_ridge/.test(o.name))ridges.push(o);});
 if(ridges.length){scene.updateMatrixWorld(true);const forest=createForest({ridges,viewpoint:new THREE.Vector3(.5,3.2,-10),count:mobile?1800:4200,layer:REFLECTED});scene.add(forest);canvas.dataset.forest=forest.userData.stats.trees;}
 setStatus('Przygotowuję materiały i światło…');
 await renderer.compileAsync(scene,camera);
 // A missing transition photograph must not prevent entering the loaded house.
 try{await createPortal();}catch(e){console.warn('Fotoprojekcja niedostępna; używam łagodnego przejścia.',e);}
 renderer.render(scene,camera);mainRenders++;renderer.shadowMap.autoUpdate=false;ready=true;draco.dispose();
 $('#begin').style.setProperty('--p',100);$('#begin').classList.add('ready');setStatus('Zachód słońca. Chwila tylko dla Ciebie.');
 if(state==='waiting')startTransition();
 }catch(e){loadFailure(e);}
},p=>{if(p.total){const pct=Math.round(p.loaded/p.total*100);$('#begin').style.setProperty('--p',pct);setStatus(pct===100?'Przygotowuję materiały i światło…':`Przygotowuję dom · ${pct}%`);}},loadFailure);
function loadFailure(e){
 console.error(e);failed=true;state='welcome';video.pause();video.style.opacity=1;document.body.classList.remove('playing','exploring');$('#skip').hidden=true;
 $('#title').textContent='Spróbujmy jeszcze raz.';setStatus('Nie udało się wczytać domu. Sprawdź połączenie i spróbuj ponownie.');
 const b=$('#begin');b.querySelector('.label').textContent='Spróbuj ponownie';b.hidden=false;showWelcome();
}
async function createPortal(){
 const texture=await new THREE.TextureLoader().loadAsync('assets/threshold.webp');texture.colorSpace=THREE.SRGBColorSpace;
 portal=new THREE.Group();portal.position.copy(entry);portal.quaternion.copy(initialQ);portalScene.add(portal);
 const d=2.83,h=2*d*Math.tan(THREE.MathUtils.degToRad(22)),w=h*16/9;
 function piece(u0,u1,pivot=false){const g=new THREE.PlaneGeometry(w*(u1-u0),h);const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,u0+uv.getX(i)*(u1-u0));const m=new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,toneMapped:false,depthWrite:true});portalMats.push(m);const mesh=new THREE.Mesh(g,m);mesh.position.set(w*((u0+u1)/2-.5),0,-d);if(pivot){portalHinge=new THREE.Group();portalHinge.position.set(w*(u0-.5),0,-d);mesh.position.set(w*(u1-u0)/2,0,0);portalHinge.add(mesh);portal.add(portalHinge);}else portal.add(mesh);}
 // Measured on the 1920 px threshold image. The lock occupies x=1310..1345;
 // keep it entirely on the moving leaf, with an 11 px timber margin.
 const hingeU=795/1920,latchU=1356/1920;
 piece(0,hingeU);piece(hingeU,latchU,true);piece(latchU,1);portal.visible=false;
}

function showWelcome(){const w=$('#welcome');w.hidden=false;w.inert=false;w.style.opacity=1;w.style.pointerEvents='auto';}
function hideWelcome(){const w=$('#welcome');w.style.opacity=0;w.style.pointerEvents='none';w.inert=true;}
function begin(){
 if(state!=='welcome')return;if(failed){location.reload();return;}
 state='intro';hideWelcome();document.body.classList.add('playing');$('#skip').hidden=false;$('#restart').hidden=false;
 if(reduced||videoFailed||video.error){videoFailed=videoFailed||!!video.error;endVideo();return;}
 video.currentTime=0;video.play().catch(error=>{
  // The error event may already have started the fallback. Do not undo it.
  if(state!=='intro')return;
  if(video.error||error.name==='NotSupportedError'){videoFailed=true;endVideo();return;}
  state='welcome';showWelcome();$('#skip').hidden=true;$('#restart').hidden=true;document.body.classList.remove('playing');setStatus('Dotknij ponownie, aby odtworzyć intro.');
 });
}
$('#begin').onclick=begin;
function endVideo(){if(state!=='intro')return;video.pause();$('#skip').hidden=true;if(!ready){state='waiting';document.body.classList.remove('playing');$('#title').textContent='Jeszcze chwila.';$('#begin').hidden=!failed;$('.lede').hidden=true;showWelcome();return;}startTransition();}
video.addEventListener('ended',endVideo);video.addEventListener('timeupdate',()=>{if(state==='intro')$('#progress').style.width=`${video.currentTime/(video.duration||10)*100}%`;});
video.addEventListener('error',()=>{videoFailed=true;if(state==='intro')endVideo();});
$('#skip').onclick=endVideo;
function startTransition(){
 state='transition';transitionStart=performance.now();renderer.shadowMap.autoUpdate=true;camera.position.copy(entry);camera.quaternion.copy(initialQ);
 hideWelcome();$('#progress').style.width='0';document.body.classList.remove('playing');document.body.classList.add('exploring');
 if(reduced||videoFailed||!portal){fadeTo(new THREE.Vector3(...stops[0].pos),new THREE.Vector3(...stops[0].look),true);return;}
 portal.visible=true;portalHinge.rotation.y=0;portalMats.forEach(m=>m.opacity=1);video.style.transition='none';video.style.opacity=0;video.style.pointerEvents='none';
}
function fadeTo(end,look,first=false){
 state='fade';keys.clear();$('#motion-veil').style.opacity=1;
 // Keep the poster above the initial fade until the camera is already indoors.
 clearTimeout(fadeTimer);fadeTimer=setTimeout(()=>{
  camera.position.copy(end);if(look)camera.lookAt(look);camera.fov=exploreFov();camera.updateProjectionMatrix();
  if(door)door.rotation.y=0;renderer.shadowMap.needsUpdate=true;reflectionDirty=true;
  video.style.opacity=0;video.style.pointerEvents='none';explore();
  if(first){exploreStart=performance.now();showHint(9000);}
  fadeTimer=setTimeout(()=>{$('#motion-veil').style.opacity=0;},60);
 },180);
}
function explore(){
 const first=state==='transition';state='explore';if(portal)portal.visible=false;$('#welcome').hidden=true;$('#hud').hidden=false;$('#help').hidden=false;$('#quiet').hidden=false;$('#touch').hidden=!mobile;syncAngles();renderer.shadowMap.autoUpdate=false;
 if(first){exploreStart=performance.now();showHint(9000);}
}
function walkPath(end,look,duration){
 const points=navigate(camera.position,end);if(!points){showHint(4000,'Nie da się tam przejść — wybierz miejsce na podłodze.');return false;}
 if(reduced){fadeTo(end,look);return true;}
 walkCurve=new THREE.CurvePath();for(let i=1;i<points.length;i++)walkCurve.add(new THREE.LineCurve3(points[i-1],points[i]));walkDuration=duration(walkCurve.getLength());
 walkFromQ=camera.quaternion.clone();const lookcam=camera.clone();lookcam.position.copy(end);if(look)lookcam.lookAt(look);else lookcam.quaternion.setFromEuler(new THREE.Euler(pitch,Math.atan2(camera.position.x-end.x,camera.position.z-end.z),0,'YXZ'));walkToQ=lookcam.quaternion.clone();
 walkStart=performance.now();state='walk';return true;
}
function walkTo(i){
 if(state!=='explore'&&state!=='walk')return;const stop=stops[i];
 if(walkPath(new THREE.Vector3(...stop.pos),new THREE.Vector3(...stop.look),l=>THREE.MathUtils.clamp(l/1.15*1000,2200,10000)))markStop(i);
}
$('#tour').onclick=()=>walkTo((current+1)%stops.length);
function reset(){
 clearTimeout(fadeTimer);$('#motion-veil').style.opacity=0;setQuiet(false);
 state='welcome';keys.clear();dragging=false;video.currentTime=0;video.pause();video.style.transition='';video.style.opacity=1;video.style.pointerEvents='auto';
 $('#title').innerHTML='Blisko <em>natury</em>.';$('.lede').hidden=failed;$('#begin').hidden=false;showWelcome();
 for(const id of ['#hud','#touch','#skip','#help','#restart','#quiet'])$(id).hidden=true;hideHint();$('#progress').style.width='0';
 document.body.classList.remove('exploring','playing');camera.position.copy(entry);camera.quaternion.copy(initialQ);if(door)door.rotation.y=0;if(portal)portal.visible=false;markStop(0);renderer.shadowMap.autoUpdate=true;resize();
}
$('#restart').onclick=reset;

// Podpowiedź sterowania
let hintTimer;
const controlsHint=mobile?'Przesuń palcem, aby się rozejrzeć · dotknij podłogi, aby tam przejść':'Przeciągnij, aby się rozejrzeć · kliknij podłogę, aby przejść · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> lub strzałki';
function showHint(ms,text){const h=$('#hint');if(text)h.textContent=text;else h.innerHTML=controlsHint;h.classList.add('show');clearTimeout(hintTimer);hintTimer=setTimeout(hideHint,ms);}
function hideHint(){$('#hint').classList.remove('show');}
$('#help').onclick=()=>$('#hint').classList.contains('show')?hideHint():showHint(8000);
function setQuiet(on){
 document.body.classList.toggle('quiet',on);
 const b=$('#quiet');b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',on?'Pokaż interfejs':'Ukryj interfejs');b.title=`${b.getAttribute('aria-label')} (H)`;
 for(const selector of ['#hud','#touch','#help','#fullscreen','#restart'])$(selector).inert=on;
 if(on)hideHint();
}
$('#quiet').onclick=()=>setQuiet(!document.body.classList.contains('quiet'));
addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;if(e.code==='KeyH'&&(state==='explore'||state==='walk'))setQuiet(!document.body.classList.contains('quiet'));if(e.code==='Escape')setQuiet(false);});

// Pełny ekran (niedostępny m.in. na iPhonie — wtedy przycisk jest ukryty)
const fsButton=$('#fullscreen');
if(document.fullscreenEnabled){fsButton.hidden=false;fsButton.onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(()=>{});
 document.addEventListener('fullscreenchange',()=>{const on=!!document.fullscreenElement;fsButton.setAttribute('aria-label',on?'Zamknij pełny ekran':'Pełny ekran');fsButton.title=fsButton.getAttribute('aria-label');fsButton.querySelector('path').setAttribute('d',on?'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5':'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5');});}

// Rozglądanie się i przejście w kliknięte miejsce
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();raycaster.layers.enableAll();raycaster.far=25;
canvas.addEventListener('pointerdown',e=>{if(state!=='explore'&&state!=='walk')return;dragging=true;dragMoved=0;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
canvas.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;dragMoved+=Math.abs(dx)+Math.abs(dy);if(dragMoved<5)return;if(state==='walk')explore();hideHint();const k=mobile?.0045:.003;yaw-=dx*k;pitch=THREE.MathUtils.clamp(pitch-dy*k*.87,-.8,.9);camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));});
canvas.addEventListener('pointerup',e=>{if(!dragging)return;dragging=false;canvas.classList.remove('dragging');if(dragMoved<5)walkToPoint(e.clientX,e.clientY);});
canvas.addEventListener('pointercancel',()=>{dragging=false;canvas.classList.remove('dragging');});
function walkToPoint(x,y){
 if(state==='walk')explore();if(state!=='explore')return;
 pointer.set(x/innerWidth*2-1,-(y/innerHeight)*2+1);raycaster.setFromCamera(pointer,camera);
 scene.updateMatrixWorld();const destination=pickWalkDestination(raycaster,pickMeshes,valid);
 if(!destination){showHint(2600,'Wskaż widoczne, wolne miejsce na podłodze lub tarasie.');return;}
 hideHint();if(walkPath(destination,null,l=>THREE.MathUtils.clamp(l/1.3*1000,700,8000)))leaveStop();
}
const keymap={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;if(keymap[e.code]&&(state==='explore'||state==='walk')){e.preventDefault();if(state==='walk')explore();keys.add(keymap[e.code]);hideHint();leaveStop();}if(e.code==='Escape'){keys.clear();dragging=false;if(state==='walk')explore();}if(e.code==='Space'&&e.target===document.body){e.preventDefault();if(state==='welcome')begin();else if(state==='intro')endVideo();else walkTo((current+1)%stops.length);}});
addEventListener('keyup',e=>keys.delete(keymap[e.code]));addEventListener('blur',()=>{keys.clear();dragging=false;});
document.addEventListener('visibilitychange',()=>{keys.clear();clock.getDelta();});
for(const b of document.querySelectorAll('[data-move]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(state==='walk')explore();keys.add(b.dataset.move);hideHint();leaveStop();};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>keys.delete(b.dataset.move);b.oncontextmenu=e=>e.preventDefault();}
const obstacles=[[3.075,3.455,5.31,7.75],[2.18,2.70,8.53,9.05],[-3.39,-2.70,4.96,5.46],[-3.6,-2.46,5.6,7.9],[-.20,1.06,5.35,8.54],[-1.67,-.69,6.46,7.44],[-1.64,-.56,2.05,3.95],[-.49,.05,2.2,3.74],[-3.6,-2.65,.73,4.9],[.94,3.19,2.31,4.66],[-3.5,-2.03,.12,.7],[-2.95,-1.1,10.6,11.6],[-2.28,-1.55,8.48,9.14],[-.85,-.29,8.93,9.49],[-.06,.06,9.94,10.06]];
function valid(x,z){const y=-z;if(x< -3.27||x>3.27||y<.55||y>12.1)return false;return !obstacles.some(([a,b,c,d])=>x>a-.16&&x<b+.16&&y>c-.16&&y<d+.16);}
function segmentClear(a,b){
 if(!valid(a.x,a.z)||!valid(b.x,b.z))return false;
 return !obstacles.some(([x0,x1,y0,y1])=>{
  let lo=0,hi=1;
  for(const [p,delta,min,max] of [[a.x,b.x-a.x,x0-.16,x1+.16],[-a.z,a.z-b.z,y0-.16,y1+.16]]){
   if(Math.abs(delta)<1e-9){if(p<=min||p>=max)return false;continue;}
   const t0=(min-p)/delta,t1=(max-p)/delta;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>=hi)return false;
  }
  return lo<hi;
 });
}
function navigate(start,end){
 const step=.12,nx=54,ny=96,origin=-3.18;const position=id=>new THREE.Vector3(origin+(id%nx)*step,2.09,-(.6+Math.floor(id/nx)*step));
 function nearest(v){let best=-1,distance=Infinity;for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const p=position(y*nx+x);if(!valid(p.x,p.z))continue;const d=p.distanceToSquared(v);if(d<distance){distance=d;best=y*nx+x;}}return best;}
 const a=nearest(start),b=nearest(end);if(a<0||b<0)return null;const costs=new Map([[a,0]]),previous=new Map(),open=[a],closed=new Set();
 while(open.length){let best=0;for(let i=1;i<open.length;i++)if(costs.get(open[i])+position(open[i]).distanceTo(end)<costs.get(open[best])+position(open[best]).distanceTo(end))best=i;const id=open.splice(best,1)[0];if(id===b)break;closed.add(id);const x=id%nx,y=Math.floor(id/nx);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const xx=x+dx,yy=y+dy,n=yy*nx+xx;if(xx<0||xx>=nx||yy<0||yy>=ny||closed.has(n))continue;const p=position(n);if(!valid(p.x,p.z))continue;if(dx&&dy){const px=position(y*nx+xx),py=position(yy*nx+x);if(!valid(px.x,px.z)||!valid(py.x,py.z))continue;}const c=costs.get(id)+step*Math.hypot(dx,dy);if(c<(costs.get(n)??Infinity)){costs.set(n,c);previous.set(n,id);if(!open.includes(n))open.push(n);}}
 }
 if(a!==b&&!previous.has(b))return null;let ids=[b];while(ids.at(-1)!==a)ids.push(previous.get(ids.at(-1)));ids.reverse();const raw=[start.clone(),...ids.map(position),end.clone()];
 const result=[raw[0]];for(let i=0;i<raw.length-1;){let j=raw.length-1;while(j>i+1&&!segmentClear(raw[i],raw[j]))j--;result.push(raw[j]);i=j;}return result;
}
function fittedFov(f){return camera.aspect>16/9?THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(f/2))*16/9/camera.aspect)):f;}
// W pionie (telefon) poszerzamy kadr, żeby poziome pole widzenia nie spadało poniżej ~40°.
function exploreFov(){if(camera.aspect>=1)return fittedFov(58);return Math.min(78,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(29))/Math.sqrt(camera.aspect))));}
function applyQuality(){
 renderQuality=qualitySettings(quality.level,mobile,maxPixelRatio,minPixelRatio);pixelRatio=renderQuality.pixelRatio;
 renderer.setPixelRatio(pixelRatio);composer.setPixelRatio(pixelRatio);
 for(const target of [composer.renderTarget1,composer.renderTarget2])if(target.samples!==renderQuality.samples){target.samples=renderQuality.samples;target.dispose();}
 ao.enabled=renderQuality.aoEnabled;ao.setSize(Math.max(1,Math.floor(innerWidth*pixelRatio*renderQuality.aoScale)),Math.max(1,Math.floor(innerHeight*pixelRatio*renderQuality.aoScale)));
 if(reflector){const s=reflectionSize();reflector.getRenderTarget().setSize(s.x,s.y);}reflectionDirty=true;
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.fov=state==='explore'||state==='walk'||state==='fade'?exploreFov():fittedFov(44);camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);applyQuality();}
addEventListener('resize',resize);resize();
function animate(){requestAnimationFrame(animate);const rawDelta=clock.getDelta(),dt=Math.min(rawDelta,.05),now=performance.now();if(document.hidden)return;frameNumber++;frameAverage=frameAverage*.95+Math.min(rawDelta,.25)*.05;
 const time=now*.001;flameUniform.time.value=time;if(reflector)reflector.material.uniforms.time.value=time;fireLight.intensity=.62+Math.sin(now*.009)*.08;
 if(state==='transition'){
  const t=(now-transitionStart)/1000,open=THREE.MathUtils.smoothstep(t,.2,2.5);portalHinge.rotation.y=-open*1.28;if(door)door.rotation.y=-open*1.5*(1-THREE.MathUtils.smoothstep(t,4.2,5.5));
  const fade=1-THREE.MathUtils.smoothstep(t,1.3,2.7);portalMats.forEach(m=>m.opacity=fade);
  const move=THREE.MathUtils.smoothstep(t,1.2,5.5);camera.position.lerpVectors(entry,new THREE.Vector3(...stops[0].pos),move);camera.fov=THREE.MathUtils.lerp(fittedFov(44),exploreFov(),THREE.MathUtils.smoothstep(t,2.7,5.5));camera.updateProjectionMatrix();
  const qcam=camera.clone();qcam.lookAt(...stops[0].look);camera.quaternion.slerpQuaternions(initialQ,qcam.quaternion,THREE.MathUtils.smoothstep(t,3.5,5.5));if(t>5.5)explore();
 }else if(state==='walk'){
  const t=Math.min((now-walkStart)/walkDuration,1),e=t*t*(3-2*t);camera.position.copy(walkCurve.getPoint(e));camera.quaternion.slerpQuaternions(walkFromQ,walkToQ,e);if(t===1)explore();
 }else if(state==='explore'&&keys.size){
  const f=(keys.has('forward')?1:0)-(keys.has('back')?1:0),r=(keys.has('right')?1:0)-(keys.has('left')?1:0),speed=dt*1.45/Math.max(1,Math.hypot(f,r));const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*r)*speed,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*r)*speed;
  if(valid(camera.position.x+dx,camera.position.z))camera.position.x+=dx;if(valid(camera.position.x,camera.position.z+dz))camera.position.z+=dz;
 }
 // The opaque poster/video covers the canvas. Warm it once when loaded, then
 // leave the GPU available for video decoding until the actual handoff.
 if(state==='explore'||state==='walk'||state==='transition'||state==='fade'){
  composer.render();mainRenders++;if(state==='transition'&&portal){renderer.autoClear=false;renderer.clearDepth();renderer.render(portalScene,camera);renderer.autoClear=true;}
 }
 if((state==='explore'||state==='walk')&&now-exploreStart>5000&&quality.update(rawDelta))applyQuality();
 if(frameNumber%30===0){canvas.dataset.state=state;canvas.dataset.fps=Math.round(1/frameAverage);canvas.dataset.pixelRatio=pixelRatio.toFixed(2);canvas.dataset.quality=quality.level;canvas.dataset.mainRenders=mainRenders;canvas.dataset.reflectionRenders=reflectionRenders;canvas.dataset.camera=camera.position.toArray().map(n=>n.toFixed(2)).join(',');canvas.dataset.door=door?door.rotation.y.toFixed(3):'loading';}
}
animate();
if(new URLSearchParams(location.search).has('debug'))window.ostoja={THREE,scene,camera,renderer,composer,get reflector(){return reflector;},stops,walkTo,valid};
