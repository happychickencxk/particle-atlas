export const IDS=['form','distribution','scale','earth','time','terrain','identity'];
export const PA_PATH='M213 420L331 125H433C533 125 533 280 433 280H269 M331 125L449 420';
export const EARTH_ROT=[.14,-2.45,0];
export const TERRAIN_ROT=[.92,-.52,0];
export function rotateXYZ(p,r){let [x,y,z]=p;let a=x*Math.cos(r[2])-y*Math.sin(r[2]),b=x*Math.sin(r[2])+y*Math.cos(r[2]);x=a;y=b;a=x*Math.cos(r[1])+z*Math.sin(r[1]);b=-x*Math.sin(r[1])+z*Math.cos(r[1]);x=a;z=b;a=y*Math.cos(r[0])-z*Math.sin(r[0]);b=y*Math.sin(r[0])+z*Math.cos(r[0]);return[x,a,b];}
export function geoPoint(lat,lon,r=.31){let a=lat*Math.PI/180,b=lon*Math.PI/180;return[r*Math.cos(a)*Math.sin(b),r*Math.sin(a),r*Math.cos(a)*Math.cos(b)];}
export function plotX(v,a,b,l=90,r=660){return l+(v-a)/(b-a)*(r-l)}
export function plotY(v,a,b,t=50,bottom=450){return bottom-(v-a)/(b-a)*(bottom-t)}
export const COLUMNS={distribution:[['species','Species'],['flipper_mm','Flipper (mm)'],['mass_g','Mass (g)']],scale:[['country','Country'],['value','Population']],time:[['year','Year'],['anomaly','Anomaly (°C)']],earth:[['time_ms','UTC'],['place','Location'],['mag','Magnitude'],['depth_km','Depth (km)']]};
