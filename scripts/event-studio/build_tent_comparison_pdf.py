"""One-page supplier comparison using the same metre-based library and renders."""
from pathlib import Path
import json, shutil
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A3, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'private/event-studio/rbc/supplier'
pdfmetrics.registerFont(TTFont('Arial',r'C:\Windows\Fonts\arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold',r'C:\Windows\Fonts\arialbd.ttf'))
pdfmetrics.registerFont(TTFont('Georgia',r'C:\Windows\Fonts\georgia.ttf'))
ink=HexColor('#234b3c');muted=HexColor('#5f6b62');line=HexColor('#d5ddcf')
page=OUT/'Lounge-Tent-Comparison.pdf'
W,H=landscape(A3);c=canvas.Canvas(str(page),pagesize=(W,H))
c.setTitle('Royal Bahrain Concours - Car club lounge options')
c.setAuthor('PICO - Event Studio')
def text(value,x,y,size=11,font='Arial',color=ink):
 c.setFont(font,size);c.setFillColor(color);c.drawString(x,y,value)
def para(value,x,top,width,size=10.5,color=muted):
 p=Paragraph(value,ParagraphStyle('copy',fontName='Arial',fontSize=size,leading=size*1.4,textColor=color))
 _,h=p.wrap(width,1000);p.drawOn(c,x,top-h);return h
c.setFillColor(HexColor('#f4f5ee'));c.rect(0,0,W,H,fill=1,stroke=0)
text('PICO  /  ROYAL BAHRAIN CONCOURS 2026',38,H-39,10,'ArialBold')
text('Car club lounge options',38,H-81,32,'Georgia')
text('Three configurations. Matched viewing scale. Dimensions in metres.',38,H-107,12,color=muted)
text('SUPPLIER COMPARISON  /  24 SEP 2026',W-299,H-39,9,color=muted)
objects=json.loads((OUT/'tent-library.json').read_text())['objects']
cards=[('OPTION A','MQ40 Hexagon','10.5 × 12 m  /  six sides',2900),('OPTION B','Arabesque open','12 m front × 6 m deep',2400),('OPTION B + FRONT GLAZING','Arabesque + glass','12 m front × 6 m deep',4200)]
gap=20;cw=(W-76-2*gap)/3;bottom=139;top=H-135;ch=top-bottom
for i,(o,(label,title,dimensions,price)) in enumerate(zip(objects,cards)):
 x=38+i*(cw+gap);c.setFillColor(HexColor('#ffffff'));c.setStrokeColor(line);c.roundRect(x,bottom,cw,ch,8,fill=1,stroke=1)
 iw=cw-2;ih=iw*.75;c.drawImage(str(ROOT/'private/event-studio/rbc'/o['preview']),x+1,top-ih-1,width=iw,height=ih)
 y=top-ih-24;text(label,x+18,y,8.8,'ArialBold');y-=29;text(title,x+18,y,23,'Georgia');y-=24;text(dimensions,x+18,y,12)
 # All plans use the identical 8 pt / metre scale, independent of footprint.
 cx=x+76;cy=y-80;s=8;points=o['points'];p=c.beginPath();p.moveTo(cx+points[0][0]*s,cy-points[0][1]*s)
 for px,pz in points[1:]:p.lineTo(cx+px*s,cy-pz*s)
 p.close();c.setFillColor(HexColor('#e7eddf'));c.setStrokeColor(HexColor('#42604e'));c.setLineWidth(.8);c.drawPath(p,fill=1,stroke=1)
 if i==2:c.setStrokeColor(HexColor('#aa7c37'));c.setLineWidth(2);c.line(cx-48,cy-24,cx+48,cy-24)
 c.setFillColor(ink);c.setFont('ArialBold',10);c.drawCentredString(cx,cy-3,'95 m²*' if i==0 else '72 m²')
 c.setFont('Arial',8);c.drawCentredString(cx,cy-61,'10.5 m' if i==0 else '12 m frontage')
 text('FOOTPRINT',cx-26,cy+60,7.5,color=muted)
 px=x+147;pw=cw-167;py=y-34
 height=para('<b>6.8 m peak</b><br/>Height from supplier sheet.' if i==0 else '<b>Three roof peaks</b><br/>5.5 m height is estimated.',px,py,pw,10.5)
 para('12 m glass front.<br/>Back and sides open.' if i==2 else 'Open around the perimeter.',px,py-height-12,pw,10.5)
 c.setStrokeColor(line);c.setLineWidth(.6);c.line(x+18,bottom+76,x+cw-18,bottom+76)
 text(f'BHD {price:,}',x+18,bottom+44,25,'Georgia');text('/ tent',x+180,bottom+45,10,color=muted)
 text('2,400 tent + 1,800 front glazing' if i==2 else 'Tent rental only',x+18,bottom+23,10,color=muted)
para('<b>Furniture and décor excluded.</b> The shown deck is a proposed addition and is not included in these prices. Flooring, VAT and rental period were not specified. Rates are from the supplied quotation; no booking is implied.',38,115,W-76,10)
para('<b>Accuracy:</b> footprints follow supplied dimensions; roof curves and frame details are visual reconstructions. Arabesque height and eaves remain estimates. *MQ40 is quoted as 95 m²; its nominal six-sided polygon is 94.5 m². These diagrams do not set the tents’ positions on the event site.',38,75,W-76,9.5)
text('Sources: supplied tent quotation, MQ40 product sheet and Arabesque reference photographs.',38,25,8.5,color=muted)
c.setFont('Arial',8.5);c.drawRightString(W-38,25,'PICO EVENT STUDIO  /  01')
c.showPage();c.save()
delivery=ROOT/'output/pdf';delivery.mkdir(parents=True,exist_ok=True);shutil.copy2(page,delivery/page.name)
import fitz
doc=fitz.open(page);assert len(doc)==1
body=doc[0].get_text()
for value in ['2,900','2,400','4,200','Furniture','estimated','94.5']:assert value in body,value
preview=ROOT/'output/playwright/tent-comparison/comparison-pdf.png'
preview.parent.mkdir(parents=True,exist_ok=True);doc[0].get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(preview)
print(json.dumps({'pdf':str(page),'pages':len(doc),'bytes':page.stat().st_size,'preview':str(preview)}))
