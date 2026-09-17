'use client';
import { useEffect, useState } from 'react';
import styles from './name-art.module.css';
export default function NameArtDownload({token}){
 const [job,setJob]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;fetch(`/api/name-art/poster/${token}`,{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(alive)setJob(data);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[token]);
 return <main className={styles.downloadPage}><span className={styles.eyebrow}>GREETINGS FROM BAHRAIN</span><h1>A keepsake with your name.</h1>{error?<p role="alert">{error}</p>:job?<><img className={styles.downloadPoster} src={`/api/name-art/poster/${token}/image`} alt={`National Day name art for ${job.name}`}/><a className={styles.primary} href={`/api/name-art/poster/${token}/download`} download>Download your poster <span>↓</span></a><p dir="rtl">حمّل بطاقتك واحتفظ بالذكرى</p><small>This private link expires {new Date(job.expiresAt).toLocaleString()}.</small></>:<p role="status">Opening your poster…</p>}</main>;
}
