import {Vector3} from 'three';

// Only a visible, upward-facing surface at walking-floor height is a destination.
// The first opaque hit may be furniture: never select the floor behind it.
export function pickWalkDestination(raycaster,meshes,valid){
 const hit=raycaster.intersectObjects(meshes,false).find(h=>{
  const m=Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;
  return h.object.visible&&m.visible&&!(m.transparent&&m.opacity<.2);
 });
 if(!hit||hit.point.y<.45||hit.point.y>.64)return null;
 const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
 // Individual boards have real bevels and tiny vertical edges. Those still
 // belong to the walking surface; a cabinet side at the same height does not.
 const floorEdge=hit.point.y<=.56&&(/Natural_oak_flooring/.test(hit.object.name)||(/Oiled_European_oak/.test(hit.object.name)&&hit.point.z< -10));
 if((normal.y<.8&&!floorEdge)||!valid(hit.point.x,hit.point.z))return null;
 return new Vector3(hit.point.x,2.09,hit.point.z);
}
