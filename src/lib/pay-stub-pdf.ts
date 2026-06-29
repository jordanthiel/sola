import { jsPDF } from 'jspdf'
import { APP_NAME } from '@/lib/app'
import { formatCurrency } from '@/lib/utils'
import type { PayrollSnapshot } from '@/types/features'

export function generatePayStubPdf(snapshot: PayrollSnapshot): jsPDF {
  const doc = new jsPDF()
  let y = 20

  const line = (text: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(text, 20, y)
    y += 8
  }

  line(`${APP_NAME} — Pay Stub`, true)
  y += 4
  if (snapshot.householdName) line(`Household: ${snapshot.householdName}`)
  if (snapshot.nannyName) line(`Employee: ${snapshot.nannyName}`)
  if (snapshot.periodLabel) line(`Period: ${snapshot.periodLabel}`)
  line(`Hours basis: ${snapshot.hoursBasis === 'actual' ? 'Actual (time entries)' : 'Scheduled'}`)
  y += 4

  line(`Total hours: ${(snapshot.totalMinutes / 60).toFixed(2)}`)
  line(`Regular: ${(snapshot.regularMinutes / 60).toFixed(2)} hrs — ${formatCurrency(snapshot.regularPayCents)}`)
  line(`Overtime: ${(snapshot.overtimeMinutes / 60).toFixed(2)} hrs — ${formatCurrency(snapshot.overtimePayCents)}`)
  if ((snapshot.overnightPayCents ?? 0) > 0) {
    line(
      `Overnight premium: ${((snapshot.overnightMinutes ?? 0) / 60).toFixed(2)} hrs — ${formatCurrency(snapshot.overnightPayCents ?? 0)}`,
    )
  }
  if ((snapshot.vacationPayCents ?? 0) > 0) {
    line(`Vacation: ${snapshot.vacationDays ?? 0} days — ${formatCurrency(snapshot.vacationPayCents ?? 0)}`)
  }
  if (snapshot.lineItemsTotalCents > 0) {
    line(`Bonuses / mileage / reimbursements: ${formatCurrency(snapshot.lineItemsTotalCents)}`)
  }
  line(`Gross pay: ${formatCurrency(snapshot.grossPayCents)}`, true)
  if (snapshot.advanceDeductionCents > 0) {
    line(`Advance repayment: -${formatCurrency(snapshot.advanceDeductionCents)}`)
  }
  line(`Net pay: ${formatCurrency(snapshot.netPayCents)}`, true)

  if (snapshot.reporting && (snapshot.reporting.totalOverCents > 0 || snapshot.reporting.totalUnderCents > 0)) {
    y += 4
    line('Pay reporting', true)
    if (snapshot.payReportingLabel) line(snapshot.payReportingLabel)
    if (snapshot.reporting.totalOverCents > 0) {
      line(`On the books: ${formatCurrency(snapshot.reporting.totalOverCents)}`)
    }
    if (snapshot.reporting.totalUnderCents > 0) {
      line(`Off the books: ${formatCurrency(snapshot.reporting.totalUnderCents)}`)
    }
    const mixed =
      snapshot.reporting.totalOverCents > 0 && snapshot.reporting.totalUnderCents > 0
    if (mixed && snapshot.regularPayCents > 0) {
      line(
        `  Regular: ${formatCurrency(snapshot.reporting.regularOverCents)} on / ${formatCurrency(snapshot.reporting.regularUnderCents)} off`,
      )
    }
    if (mixed && snapshot.overtimePayCents > 0) {
      line(
        `  Overtime: ${formatCurrency(snapshot.reporting.overtimeOverCents)} on / ${formatCurrency(snapshot.reporting.overtimeUnderCents)} off`,
      )
    }
    if (mixed && snapshot.lineItemsTotalCents > 0) {
      line(
        `  Line items: ${formatCurrency(snapshot.reporting.lineItemsOverCents)} on / ${formatCurrency(snapshot.reporting.lineItemsUnderCents)} off`,
      )
    }
  }

  if (snapshot.taxWithholdingNotes || snapshot.employmentType) {
    y += 6
    line('Tax / withholding notes', true)
    if (snapshot.employmentType) line(`Employment type: ${snapshot.employmentType}`)
    if (snapshot.taxWithholdingNotes) {
      const split = doc.splitTextToSize(snapshot.taxWithholdingNotes, 170)
      doc.setFont('helvetica', 'normal')
      doc.text(split, 20, y)
      y += split.length * 6
    }
  }

  line('', false)
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text('This is a household earnings summary, not an official tax document.', 20, y)

  return doc
}

export function downloadPayStubPdf(snapshot: PayrollSnapshot, filename: string) {
  const doc = generatePayStubPdf(snapshot)
  doc.save(filename)
}
