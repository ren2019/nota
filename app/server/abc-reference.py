"""Independent ABC oracle. Run from the existing spike's pinned music21 environment."""
import sys,json
from music21 import converter
score=converter.parse(open(sys.argv[1]).read(),format='abc');part=score.parts[0]
measures=list(part.getElementsByClass('Measure'));events=[];structure=[];positions={}
for mi,m in enumerate(measures):
 row=[]
 for n in m.recurse().notesAndRests:
  if n.isChord:raise ValueError('Select a monophonic voice; chords are not inferred')
  pitch=float(n.pitch.midi) if n.isNote else None;grace=bool(n.duration.isGrace)
  dur=0 if grace else round(float(n.duration.quarterLength),8)
  typ=n.tie.type if n.isNote and n.tie else None
  event=dict(midi=pitch,quarters=dur,grace=grace,tieStart=typ in ('start','continue'),tieStop=typ in ('stop','continue'))
  if pitch is None and not grace and row and row[-1]['midi'] is None and not row[-1]['grace']:row[-1]['quarters']=round(row[-1]['quarters']+dur,8)
  else:row.append(event)
  def pos(value):return str(round(value,8)).removesuffix('.0')
  at=float(n.getOffsetInHierarchy(m));positions[id(n)]=(f'{mi}:{pos(at)}',f'{mi}:{pos(at+dur)}')
 events.append(row)
 for location,b in [('left',m.leftBarline),('right',m.rightBarline)]:
  direction=getattr(b,'direction',None)
  if direction:
   x=dict(measure=mi+1,location=location,repeat={'start':'forward','end':'backward'}.get(direction,direction))
   if getattr(b,'times',None) not in (None,2):x['times']=b.times
   structure.append(x)
spans=[]
for s in score.spannerBundle.getByClass('Slur'):
 a=positions.get(id(s.getFirst()));b=positions.get(id(s.getLast()))
 if a and b:spans.append(dict(type='slur',start=a[0],end=b[1]))
# Canonical sorting is performed by JS, matching the product model's comparator.
print(json.dumps(dict(events=events,structure=structure,spans=spans)))
