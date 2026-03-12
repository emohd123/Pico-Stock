'use client';

import { useState, useRef } from 'react';

export default function FileUploader({ onFilesChange, files = [] }) {
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const acceptedTypes = [
        '.pdf', '.bdf', '.ppt', '.pptx',
        '.png', '.jpg', '.jpeg', '.gif', '.svg',
        '.doc', '.docx', '.xls', '.xlsx'
    ];

    const handleDragOver = (e) => {
        e.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = () => setDragOver(false);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const droppedFiles = Array.from(e.dataTransfer.files);
        onFilesChange([...files, ...droppedFiles]);
    };

    const handleFileSelect = (e) => {
        const selectedFiles = Array.from(e.target.files);
        onFilesChange([...files, ...selectedFiles]);
        e.target.value = '';
    };

    const removeFile = (index) => {
        const newFiles = files.filter((_, i) => i !== index);
        onFilesChange(newFiles);
    };

    const formatSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getFileIcon = (name) => {
        const ext = name.split('.').pop().toLowerCase();
        if (['pdf', 'bdf'].includes(ext)) return '📄';
        if (['ppt', 'pptx'].includes(ext)) return '📊';
        if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return '🖼️';
        if (['doc', 'docx'].includes(ext)) return '📝';
        if (['xls', 'xlsx'].includes(ext)) return '📑';
        return '📎';
    };

    return (
        <div>
            <div
                className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <div className="upload-zone-icon">📁</div>
                <h4>Drop files here or click to upload</h4>
                <p>Supports PDF, BDF, PowerPoint, Images, Word, Excel</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={acceptedTypes.join(',')}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                />
            </div>

            {files.length > 0 && (
                <div className="upload-file-list">
                    {files.map((file, index) => (
                        <div key={index} className="upload-file-item">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '1.2rem' }}>{getFileIcon(file.name)}</span>
                                <div>
                                    <div className="file-name">{file.name}</div>
                                    <div className="file-size">{formatSize(file.size)}</div>
                                </div>
                            </div>
                            <button
                                className="upload-file-remove"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeFile(index);
                                }}
                                title="Remove"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
