// Sustained measurements, separate degrade/recover thresholds and a long cooldown
// keep a single expensive frame from changing the visual quality.
export class QualityController {
 constructor(maxLevel=4){this.level=0;this.maxLevel=maxLevel;this.slow=0;this.fast=0;this.cooldown=5;}
 update(delta){
  if(delta<=0||delta>.15)return false;
  if(this.cooldown>0){this.cooldown-=delta;return false;}
  this.slow=delta>1/38?this.slow+delta:Math.max(0,this.slow-delta*2);
  this.fast=delta<1/56?this.fast+delta:0;
  if(this.slow>3&&this.level<this.maxLevel){this.level++;this.cooldown=8;}
  else if(this.fast>18&&this.level>0){this.level--;this.cooldown=25;}
  else return false;
  this.slow=this.fast=0;return true;
 }
}

export function qualitySettings(level,mobile,maxRatio,minRatio){
 return {
  samples:level===0?(mobile?2:4):2,
  reflectionScale:(mobile?.3:.5)*(level>=1?.7:1),
  reflectionInterval:level>=2?50:0,
  aoScale:level>=2?.65:1,
  aoEnabled:!mobile&&level<3,
  pixelRatio:level>=4?Math.max(minRatio,maxRatio-.3):maxRatio
 };
}
