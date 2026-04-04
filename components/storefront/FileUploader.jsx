'use client';

import { useRef, useState } from 'react';

const ACCEPTED_TYPES = [
    '.pdf', '.bdf', '.ppt', '.pptx',
    '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.doc', '.docx', '.xls', '.xlsx',
];

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name) {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['pdf', 'bdf'].includes(ext)) return '\u{1F4C4}';
    if (['ppt', 'pptx'].includes(ext)) return '\u{1F4CA}';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return '\u{1F5BC}\uFE0F';
    if (['doc', 'docx'].includes(ext)) return '\u{1F4DD}';
    if (['xls', 'xlsx'].includes(ext)) return '\u{1F4D1}';
    return '\u{1F4CE}';
}

export default function FileUploader({ onFilesChange, files = [] }) {
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const appendFiles = (incomingFiles) => {
        onFilesChange([...files, ...incomingFiles]);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setDragOver(false);
        appendFiles(Array.from(event.dataTransfer.files));
    };

    const handleFileSelect = (event) => {
        appendFiles(Array.from(event.target.files || []));
        event.target.value = '';
    };

    const removeFile = (index) => {
        onFilesChange(files.filter((_, fileIndex) => fileIndex !== index));
    };

    return (
        <div>
            <div
                className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <div className="upload-zone-icon">{'\u{1F4C1}'}</div>
                <h4>Drop files here or click to upload</h4>
                <p>Supports PDF, BDF, PowerPoint, Images, Word, Excel</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_TYPES.join(',')}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                />
            </div>

            {files.length > 0 && (
                <div className="upload-file-list">
                    {files.map((file, index) => (
                        <div key={`${file.name}-${file.size}-${index}`} className="upload-file-item">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '1.2rem' }}>{getFileIcon(file.name)}</span>
                                <div>
                                    <div className="file-name">{file.name}</div>
                                    <div className="file-size">{formatSize(file.size)}</div>
                                </div>
                            </div>
                            <button
                                className="upload-file-remove"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    removeFile(index);
                                }}
                                title="Remove"
                                type="button"
                            >
                                {'\u2715'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
