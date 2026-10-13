import '@/components/events/event-marketplace.css';
import './electricity.css';

export default function ElectricityTopbar({ eyebrow = 'Form B', title = 'Additional Electricity Order Form', children }) {
    return (
        <header className="evm-topbar">
            <div className="evm-topbar-inner">
                <a href="/electricity" className="evm-brand" aria-label="Pico">
                    <img src="/branding/pico-logo.png" alt="Pico" />
                </a>
                <div className="evm-topbar-title">
                    <span className="evm-eyebrow">{eyebrow}</span>
                    <strong>{title}</strong>
                </div>
                {children}
            </div>
        </header>
    );
}
