import { formatCurrencyAmount, normalizeCurrencyCode } from '@/lib/quotationCommercial';

const VALID_REPORT_STATUSES = new Set(['Draft', 'Confirmed', 'Cancelled']);

function pad(value) {
    return String(value).padStart(2, '0');
}

export function formatIsoDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseStoredQuotationDate(dateValue) {
    const parts = String(dateValue || '').split('.');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map((part) => Number(part));
    if (!day || !month || !year) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function parseIsoDate(dateValue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))) return null;
    const [year, month, day] = String(dateValue).split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfMonth(today = new Date()) {
    return new Date(today.getFullYear(), today.getMonth(), 1);
}

export function endOfMonth(today = new Date()) {
    return new Date(today.getFullYear(), today.getMonth() + 1, 0);
}

function sumMoneyByCurrency(items, picker) {
    return items.reduce((accumulator, item) => {
        const currencyCode = normalizeCurrencyCode(item.currency_code);
        const amount = Number(picker(item) || 0);
        accumulator[currencyCode] = Number(accumulator[currencyCode] || 0) + amount;
        return accumulator;
    }, {});
}

function averageMoneyByCurrency(items, picker) {
    const grouped = items.reduce((accumulator, item) => {
        const currencyCode = normalizeCurrencyCode(item.currency_code);
        const amount = Number(picker(item) || 0);
        if (!accumulator[currencyCode]) {
            accumulator[currencyCode] = { total: 0, count: 0 };
        }
        accumulator[currencyCode].total += amount;
        accumulator[currencyCode].count += 1;
        return accumulator;
    }, {});

    return Object.entries(grouped).reduce((accumulator, [currencyCode, value]) => {
        accumulator[currencyCode] = value.count > 0 ? value.total / value.count : 0;
        return accumulator;
    }, {});
}

function sortBreakdownByConfirmedValue(entries) {
    return entries.sort((left, right) => {
        const leftValue = Object.values(left.confirmed_value_by_currency || {}).reduce((sum, value) => sum + Number(value || 0), 0);
        const rightValue = Object.values(right.confirmed_value_by_currency || {}).reduce((sum, value) => sum + Number(value || 0), 0);
        if (rightValue !== leftValue) return rightValue - leftValue;
        return String(left.label || '').localeCompare(String(right.label || ''));
    });
}

function normalizeReportStatus(statusValue) {
    const status = String(statusValue || '').trim();
    return VALID_REPORT_STATUSES.has(status) ? status : '';
}

function normalizeFilterText(value) {
    return String(value || '').trim();
}

function filterIncludes(sourceValue, filterValue) {
    if (!filterValue) return true;
    return String(sourceValue || '').toLowerCase().includes(filterValue.toLowerCase());
}

export function buildQuotationReport(quotations = [], rawFilters = {}) {
    const today = new Date();
    const defaultFrom = startOfMonth(today);
    const defaultTo = endOfMonth(today);
    const requestedFrom = parseIsoDate(rawFilters.from);
    const requestedTo = parseIsoDate(rawFilters.to);
    const requestedRangeStart = requestedFrom || defaultFrom;
    const requestedRangeEnd = requestedTo || defaultTo;
    const from = requestedRangeStart <= requestedRangeEnd ? requestedRangeStart : requestedRangeEnd;
    const to = requestedRangeStart <= requestedRangeEnd ? requestedRangeEnd : requestedRangeStart;
    const status = normalizeReportStatus(rawFilters.status);
    const owner = normalizeFilterText(rawFilters.owner);
    const customer = normalizeFilterText(rawFilters.customer);

    const withDates = quotations.map((quotation) => {
        const quoteDate = parseStoredQuotationDate(quotation.date);
        return {
            ...quotation,
            quoteDate,
            quoteDateIso: quoteDate ? formatIsoDate(quoteDate) : '',
        };
    });

    const filterOptions = {
        owners: [...new Set(withDates.map((quotation) => String(quotation.created_by || '').trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
        customers: [...new Set(withDates.map((quotation) => String(quotation.client_org || quotation.client_to || '').trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    };

    const filtered = withDates.filter((quotation) => {
        if (!quotation.quoteDate) return false;
        if (quotation.quoteDate < from || quotation.quoteDate > to) return false;
        if (status && quotation.status !== status) return false;
        if (!filterIncludes(quotation.created_by, owner)) return false;
        if (!filterIncludes(quotation.client_org || quotation.client_to, customer)) return false;
        return true;
    });

    const confirmed = filtered.filter((quotation) => quotation.status === 'Confirmed');
    const draft = filtered.filter((quotation) => quotation.status === 'Draft');
    const cancelled = filtered.filter((quotation) => quotation.status === 'Cancelled');
    const currencyCodes = [...new Set(filtered.map((quotation) => normalizeCurrencyCode(quotation.currency_code)))];

    const timeseriesMap = new Map();
    for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
        const dateKey = formatIsoDate(cursor);
        timeseriesMap.set(dateKey, {
            date: dateKey,
            quotation_count: 0,
            confirmed_count: 0,
            confirmed_value_by_currency: {},
        });
    }

    filtered.forEach((quotation) => {
        if (!quotation.quoteDateIso || !timeseriesMap.has(quotation.quoteDateIso)) return;
        const bucket = timeseriesMap.get(quotation.quoteDateIso);
        bucket.quotation_count += 1;
        if (quotation.status === 'Confirmed') {
            const currencyCode = normalizeCurrencyCode(quotation.currency_code);
            bucket.confirmed_count += 1;
            bucket.confirmed_value_by_currency[currencyCode] = Number(bucket.confirmed_value_by_currency[currencyCode] || 0) + Number(quotation.total_with_vat || 0);
        }
    });

    const buildBreakdown = (items, labelPicker) => {
        const grouped = items.reduce((accumulator, item) => {
            const label = String(labelPicker(item) || 'Unassigned').trim() || 'Unassigned';
            if (!accumulator.has(label)) {
                accumulator.set(label, {
                    label,
                    quotation_count: 0,
                    confirmed_count: 0,
                    confirmed_value_by_currency: {},
                });
            }
            const current = accumulator.get(label);
            current.quotation_count += 1;
            if (item.status === 'Confirmed') {
                const currencyCode = normalizeCurrencyCode(item.currency_code);
                current.confirmed_count += 1;
                current.confirmed_value_by_currency[currencyCode] = Number(current.confirmed_value_by_currency[currencyCode] || 0) + Number(item.total_with_vat || 0);
            }
            return accumulator;
        }, new Map());

        return sortBreakdownByConfirmedValue(Array.from(grouped.values()));
    };

    return {
        filters: {
            from: formatIsoDate(from),
            to: formatIsoDate(to),
            status,
            owner,
            customer,
        },
        filter_options: filterOptions,
        summary: {
            total_count: filtered.length,
            confirmed_count: confirmed.length,
            draft_count: draft.length,
            cancelled_count: cancelled.length,
            conversion_rate: filtered.length > 0 ? confirmed.length / filtered.length : 0,
            average_value_by_currency: averageMoneyByCurrency(filtered, (quotation) => quotation.total_with_vat),
            confirmed_pipeline_by_currency: sumMoneyByCurrency(confirmed, (quotation) => quotation.total_with_vat),
            currencies: currencyCodes,
        },
        timeseries: Array.from(timeseriesMap.values()),
        status_breakdown: [
            { status: 'Draft', count: draft.length },
            { status: 'Confirmed', count: confirmed.length },
            { status: 'Cancelled', count: cancelled.length },
        ],
        owner_breakdown: buildBreakdown(filtered, (quotation) => quotation.created_by),
        customer_breakdown: buildBreakdown(filtered, (quotation) => quotation.client_org || quotation.client_to),
        rows: filtered
            .slice()
            .sort((left, right) => Number(right.qt_number || 0) - Number(left.qt_number || 0))
            .map((quotation) => ({
                id: quotation.id,
                qt_number: quotation.qt_number,
                date: quotation.date,
                quote_date_iso: quotation.quoteDateIso,
                project_title: quotation.project_title,
                client_org: quotation.client_org,
                client_to: quotation.client_to,
                created_by: quotation.created_by,
                status: quotation.status,
                currency_code: normalizeCurrencyCode(quotation.currency_code),
                total_with_vat: Number(quotation.total_with_vat || 0),
                formatted_total: formatCurrencyAmount(quotation.total_with_vat, quotation.currency_code, { withCode: true }),
            })),
        generated_at: new Date().toISOString(),
    };
}
