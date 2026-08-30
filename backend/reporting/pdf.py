"""
reporting/pdf.py
Generates a PDF compliance summary using ReportLab.
"""

import io
from datetime import datetime, timezone
from typing import List

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from engine.taint import Violation


def generate_pdf_report(
    project_id: str,
    commit_id: str,
    violations: List[Violation],
    branch: str = "main"
) -> io.BytesIO:
    """
    Generates a PDF compliance summary report and returns it as an in-memory byte buffer.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    story = []

    # Title & Header
    title_style = styles['Title']
    story.append(Paragraph("Compliance Taint Analysis Report", title_style))
    story.append(Spacer(1, 20))

    # Metadata Section
    meta_style = styles['Normal']
    meta_data = [
        f"<b>Project ID:</b> {project_id}",
        f"<b>Branch:</b> {branch}",
        f"<b>Commit ID:</b> {commit_id}",
        f"<b>Generated At:</b> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC",
        f"<b>Total Violations:</b> {len(violations)}"
    ]
    
    for item in meta_data:
        story.append(Paragraph(item, meta_style))
    story.append(Spacer(1, 30))

    # Violations Section
    if not violations:
        story.append(Paragraph("✅ No compliance violations detected. The codebase is clean.", styles['Heading3']))
    else:
        story.append(Paragraph("Detected Violations", styles['Heading2']))
        story.append(Spacer(1, 10))

        for idx, v in enumerate(violations, 1):
            # Violation Title
            header_text = f"{idx}. Rule: {v.rule_id} | Severity: {v.severity.upper()}"
            story.append(Paragraph(header_text, styles['Heading3']))
            
            # Details Table
            table_data = [
                ["Attribute", "Details"],
                ["Source Node", v.source_node],
                ["Sink Node", v.sink_node or "N/A"],
                ["Taint Types", ", ".join(v.taint_types) if v.taint_types else "None"],
                ["Suggestion", v.suggestion or "No suggestion provided."]
            ]
            
            t = Table(table_data, colWidths=[100, 430])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (1, 0), colors.darkblue),
                ('TEXTCOLOR', (0, 0), (1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (1, 0), 'Helvetica-Bold'),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.aliceblue),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            story.append(t)
            story.append(Spacer(1, 10))
            
            # Formatted Path (wrap long paths nicely)
            path_style = ParagraphStyle(
                "PathStyle",
                parent=styles['Normal'],
                fontName="Courier",
                fontSize=8,
                textColor=colors.darkred
            )
            path_str = " &rarr; ".join(v.path)
            story.append(Paragraph(f"<b>Execution Path:</b><br/>{path_str}", path_style))
            story.append(Spacer(1, 25))

    doc.build(story)
    
    # Reset buffer cursor before returning
    buffer.seek(0)
    return buffer


def export_pdf_report(buffer: io.BytesIO, file_path: str) -> None:
    """
    Writes the PDF buffer to a physical file.
    """
    with open(file_path, "wb") as f:
        f.write(buffer.getbuffer())
