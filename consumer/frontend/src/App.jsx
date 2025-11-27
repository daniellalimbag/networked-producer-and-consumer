import React, { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000';

export default function App() {
  const [videos, setVideos] = useState([]);
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/videos`);
        const data = await res.json();
        setVideos(data);
      } catch (e) {
        console.error('Failed to load videos', e);
      }
    }
    load();

    const ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'video_uploaded') {
          setVideos((prev) => [msg.payload, ...prev]);
        }
      } catch (e) {
        console.error('WS message error', e);
      }
    };
    return () => ws.close();
  }, []);

  const hoveredVideo = videos.find((v) => v.id === hoveredId) || null;
  const selectedVideo = videos.find((v) => v.id === selectedId) || null;

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '1rem' }}>
      <h1>Media Consumer</h1>
      <p>New uploads will appear here automatically.</p>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <h2>Uploaded Videos</h2>
          {videos.length === 0 && <p>No videos uploaded yet.</p>}
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {videos.map((v) => (
              <li
                key={v.id}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #ccc',
                  marginBottom: '0.5rem',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setHoveredId(v.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => setSelectedId(v.id)}
              >
                <div><strong>{v.filename}</strong></div>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>{v.id}</div>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ flex: 1 }}>
          <h2>Hover Preview (10s stub)</h2>
          {hoveredVideo ? (
            <video
              src={`${API_BASE}/api/videos/${hoveredVideo.id}/preview`}
              style={{ width: '100%', maxHeight: '300px', background: '#000' }}
              autoPlay
              muted
              loop
              controls={false}
            />
          ) : (
            <p>Hover over a video to preview.</p>
          )}

          {selectedVideo ? (
            <video
              src={`${API_BASE}/api/videos/${selectedVideo.id}/full`}
              style={{ width: '100%', maxHeight: '300px', background: '#000' }}
              controls
            />
          ) : (
            <p>Click a video to play.</p>
          )}
        </div>
      </div>
    </div>
  );
}
