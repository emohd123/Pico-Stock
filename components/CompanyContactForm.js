'use client';

import { useState } from 'react';

const initialForm = {
    name: '',
    email: '',
    phone: '',
    company: '',
    service: 'Exhibition Stands',
    message: '',
};

export default function CompanyContactForm() {
    const [form, setForm] = useState(initialForm);
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState({ type: '', message: '' });

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((current) => ({ ...current, [name]: value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setFeedback({ type: '', message: '' });
        setSubmitting(true);

        try {
            const response = await fetch('/api/company-contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Unable to send your request right now.');
            }

            setForm(initialForm);
            setFeedback({
                type: 'success',
                message: 'Thanks for reaching out. Our team will contact you shortly.',
            });
        } catch (error) {
            setFeedback({
                type: 'error',
                message: error.message || 'Something went wrong. Please try again.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="company-contact-form" onSubmit={handleSubmit}>
            {feedback.message && (
                <div className={`alert ${feedback.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                    {feedback.message}
                </div>
            )}

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input
                        className="form-input"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Your name"
                        autoComplete="name"
                        required
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Company *</label>
                    <input
                        className="form-input"
                        name="company"
                        value={form.company}
                        onChange={handleChange}
                        placeholder="Company name"
                        autoComplete="organization"
                        required
                    />
                </div>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Email *</label>
                    <input
                        className="form-input"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="email@company.com"
                        autoComplete="email"
                        required
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Phone *</label>
                    <input
                        className="form-input"
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="+973 XXXX XXXX"
                        autoComplete="tel"
                        required
                    />
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Service Interested In *</label>
                <select
                    className="form-select"
                    name="service"
                    value={form.service}
                    onChange={handleChange}
                    required
                >
                    <option>Exhibition Stands</option>
                    <option>Event Environments</option>
                    <option>Interiors & Fit-Out</option>
                    <option>Booth Furniture & Rental Support</option>
                    <option>Graphics & Signage</option>
                    <option>AV & Digital Display Support</option>
                </select>
            </div>

            <div className="form-group">
                <label className="form-label">Project Brief *</label>
                <textarea
                    className="form-textarea"
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    placeholder="Tell us about your event, space, timeline, and what kind of support you need."
                    rows={5}
                    required
                />
            </div>

            <button className="btn btn-primary btn-lg" type="submit" disabled={submitting}>
                {submitting ? 'Sending Request...' : 'Send Service Inquiry'}
            </button>
        </form>
    );
}
