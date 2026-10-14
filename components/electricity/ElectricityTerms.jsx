/**
 * Terms & conditions as typed in Form setup (one line each). When the text
 * carries its own numbering ("1. Scope", "1.1 …") it is kept as written:
 * "1. …" lines become section headings, "1.1 …" lines clauses, and any lines
 * before the first section an intro. Plain lines without numbers are numbered
 * automatically.
 */
const SECTION = /^(\d+)\.\s+(.+)$/;
const CLAUSE = /^(\d+\.\d+(?:\.\d+)*)\.?\s+(.+)$/;

export default function ElectricityTerms({ text }) {
    const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const numbered = lines.some((line) => SECTION.test(line) || CLAUSE.test(line));

    if (!numbered) {
        return (
            <ol className="elx-terms">
                {lines.map((line, index) => <li key={index}>{line}</li>)}
            </ol>
        );
    }

    let seenSection = false;
    let introCount = 0;
    return (
        <div className="elx-terms-doc">
            {lines.map((line, index) => {
                const clause = line.match(CLAUSE);
                if (clause) {
                    return (
                        <p key={index} className="elx-terms-clause">
                            <span>{clause[1]}</span>{clause[2]}
                        </p>
                    );
                }
                const section = line.match(SECTION);
                if (section) {
                    seenSection = true;
                    return <h3 key={index} className="elx-terms-section">{section[1]}. {section[2]}</h3>;
                }
                if (!seenSection) {
                    introCount += 1;
                    return <p key={index} className={introCount === 1 ? 'elx-terms-title' : 'elx-terms-sub'}>{line}</p>;
                }
                return <p key={index} className="elx-terms-clause plain">{line}</p>;
            })}
        </div>
    );
}
