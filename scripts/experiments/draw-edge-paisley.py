"""Original paisley curves, scaled small / large / small into the fixed shaping trial."""
import json,sys
from pathlib import Path
wide='--wide21' in sys.argv
W,H=(21,81) if wide else (20,75)
cells=[[0]*W for _ in range(H)]
outer=[(23,1),(29,11),(18,12),(24,21),(30,32),(20,41),(10,38),(0,35),(0,24),(5,17),(9,11),(17,10),(17,5),(17,1),(13,2),(14,6),(17,8),(21,7),(23,1)]
inner=[(20,10),(12,13),(7,19),(6,26),(4,34),(13,37),(19,32),(25,27),(16,21),(18,16)]
placements=[{'name':'small start','x':1.5,'y':4,'sx':.22,'sy':.4}, {'name':'large middle','x':2,'y':25,'sx':.5,'sy':.65}, {'name':'small finish','x':1.5,'y':55,'sx':.22,'sy':.4}]
if wide:
 placements[0]['y']+=5
 placements[1]['y']+=3
 placements[1]['sx']=.45
 placements[2]['y']+=1
for m in placements:
 for points in [outer,inner]:
  for i in range(0,len(points)-1,3):
   a,b,c,d=points[i:i+4]
   for j in range(241):
    t=j/240;u=1-t
    x=m['x']+m['sx']*(u**3*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t**3*d[0])
    y=m['y']+m['sy']*(u**3*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t**3*d[1])
    xx,yy=round(x),round(y)
    if 0<=xx<W and 0<=yy<H:cells[yy][xx]=1
Path(f'fixtures/experiments/reversible-paisley-{W}x{H}.json').write_text(json.dumps({'description':'Small start / large middle / small finish, bottom-up. Original paisley outer/inner curves; dense core omitted at this resolution. Construction edges override artwork.','placements':placements,'width':W,'height':H,'cells':cells},indent=2)+'\n')
