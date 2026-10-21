"""Writes the made-up CV used by the live end-to-end check (no real person's data)."""
import sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

LINES = """Sam Taylor
12 Example Road, London E5 9PB
sam.taylor.e2e@example.com | 07700 900123 | linkedin.com/in/sam-taylor-e2e

PROFILE
Organised administrator with five years of office, customer service and finance support experience.

EXPERIENCE
Office Administrator, Northbridge Properties, London | 03/2021 - Present
- Managed the shared inbox, diaries and supplier invoices for a team of 20
- Prepared weekly reports in Excel and kept customer records up to date
- Answered customer calls and resolved queries the same day

Customer Service Advisor, Brightline Energy, London | 06/2018 - 02/2021
- Handled 60 customer calls a day on billing and account changes
- Trained four new starters on the CRM system

EDUCATION
BA (Hons) Business Management, University of Leeds | 2015 - 2018

SKILLS
Microsoft Excel, Word and Outlook; CRM systems; data entry; customer service; scheduling
""".splitlines()

out = sys.argv[1]
c = canvas.Canvas(out, pagesize=A4)
y = 800
for line in LINES:
    c.setFont('Helvetica-Bold' if line.isupper() or line == 'Sam Taylor' else 'Helvetica', 11)
    c.drawString(56, y, line)
    y -= 16
c.save()
print(out)
