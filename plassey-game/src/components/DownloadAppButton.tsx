import React, { useState, useEffect } from 'react';

export const DownloadAppButton: React.FC = () => {
    const [isAndroid, setIsAndroid] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState('');

    useEffect(() => {
        // 1. Check if already in a native wrapper (Capacitor/Cordova)
        const isNative = (window as any).Capacitor || (window as any).cordova;
        if (isNative) return;

        // 2. Regex check for Android
        const ua = navigator.userAgent;
        if (/android/i.test(ua)) {
            setIsAndroid(true);
            
            // 3. Fetch latest release from GitHub
            fetch('https://api.github.com/repos/rakinthegreat/Plassey/releases/latest')
                .then(res => res.json())
                .then(data => {
                    if (data && data.assets) {
                        const apkAsset = data.assets.find((asset: any) => asset.name.endsWith('.apk'));
                        if (apkAsset) {
                            setDownloadUrl(apkAsset.browser_download_url);
                        }
                    }
                })
                .catch(err => console.error('Failed to fetch latest APK:', err));
        }
    }, []);

    if (!isAndroid || !downloadUrl) return null;

    return (
        <a 
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full mt-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-4 px-6 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] transform active:scale-95 transition-all flex flex-col items-center justify-center gap-1 border border-emerald-400/30 group"
        >
            <div className="flex items-center gap-3">
                <span className="text-xl group-hover:animate-bounce">📥</span>
                <span className="uppercase tracking-widest text-sm">Download Native App</span>
            </div>
            <span className="text-[9px] text-emerald-100/50 font-medium uppercase tracking-[0.2em]">Latest Tactical APK Release</span>
        </a>
    );
};
