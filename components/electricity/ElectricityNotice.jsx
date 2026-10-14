/**
 * The highlighted note above the power options, as typed in Form setup.
 * One line becomes one point: a first line in capitals (or starting with ⚠️)
 * is the heading, "Label: text" lines get a bold label, and a point with three
 * or more sentences shows the first one inline and the rest as sub-points.
 * A note typed as a single paragraph shows as before.
 */
const LABEL = /^([^:]{2,60}):\s+(.+)$/;

function isHeading(line) {
    const letters = line.replace(/[^A-Za-z]/g, '');
    return /^⚠/.test(line) || (letters.length >= 6 && letters === letters.toUpperCase());
}

function sentences(text) {
    return text.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) || [text];
}

export default function ElectricityNotice({ text }) {
    const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) return lines.length ? <p className="elx-intro">{lines[0]}</p> : null;

    const heading = isHeading(lines[0]) ? lines[0].replace(/^⚠️?\s*/, '') : '';
    const points = heading ? lines.slice(1) : lines;

    return (
        <div className="elx-notice">
            {heading && <div className="elx-notice-head"><span aria-hidden="true">⚠️</span>{heading}</div>}
            <ul>
                {points.map((line, index) => {
                    const labelled = line.match(LABEL);
                    const label = labelled ? labelled[1] : '';
                    const body = labelled ? labelled[2] : line;
                    const parts = sentences(body);
                    return (
                        <li key={index}>
                            {label && <strong>{label}: </strong>}
                            {parts.length >= 3 ? (
                                <>
                                    {parts[0]}
                                    <ul>{parts.slice(1).map((part) => <li key={part}>{part}</li>)}</ul>
                                </>
                            ) : body}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
