const { google } = require('googleapis');
const fs = require('fs');

class YouTubeService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'https://aksarastream.ddns.net/auth/google/callback'
    );
    this.youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });
  }

  async createBroadcast({ refreshToken, title, description, thumbnailPath }) {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });

    console.log('🎬 [YouTube] Creating Live Broadcast...');
    const broadcastRes = await this.youtube.liveBroadcasts.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: title || 'Lofi Jazz 24/7',
          description: description || 'Automated Lofi Jazz Stream',
          scheduledStartTime: new Date().toISOString(),
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
      },
    });
    const broadcastId = broadcastRes.data.id;

    console.log('📡 [YouTube] Creating Live Stream (RTMP)...');
    const streamRes = await this.youtube.liveStreams.insert({
      part: 'snippet,cdn',
      requestBody: {
        snippet: { title: `Stream Engine for ${title || broadcastId}` },
        cdn: {
          frameRate: '30fps',
          ingestionType: 'rtmp',
          resolution: '1080p',
        },
      },
    });
    const streamId = streamRes.data.id;
    const rtmpUrl = streamRes.data.cdn.ingestionInfo.ingestionAddress;
    const streamKey = streamRes.data.cdn.ingestionInfo.streamName;

    console.log('🔗 [YouTube] Binding Broadcast to Stream...');
    await this.youtube.liveBroadcasts.bind({
      part: 'id,contentDetails',
      id: broadcastId,
      streamId: streamId,
    });

    if (thumbnailPath && fs.existsSync(thumbnailPath)) {
      console.log('🖼️ [YouTube] Uploading Thumbnail...');
      await this.youtube.thumbnails.set({
        videoId: broadcastId,
        media: { body: fs.createReadStream(thumbnailPath) },
      });
    }

    console.log('✅ [YouTube] Broadcast created. Start FFmpeg, then call goLive().');
    return {
      broadcastId,
      streamId,
      rtmpUrl: `${rtmpUrl}/${streamKey}`,
    };
  }

  async goLive({ refreshToken, broadcastId, streamId }) {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });

    // 1. Tunggu stream RTMP siap (yang sudah lo punya)
    console.log('⏳ [YouTube] Waiting for stream to become active...');
    await this._waitForStreamActive(streamId);

    // 2. Tambahkan delay kecil untuk propagasi
    await new Promise(r => setTimeout(r, 5000));

    const broadcastCheck = await this.youtube.liveBroadcasts.list({
      part: 'status',
      id: broadcastId,
    });
    const broadcastStatus = broadcastCheck.data.items?.[0]?.status?.lifeCycleStatus;
    console.log(`📊 [YouTube] Broadcast status sebelum transisi: ${broadcastStatus}`);
    
    console.log('🚀 [YouTube] Transitioning broadcast to Live...');

    console.log('🚀 [YouTube] Transitioning broadcast to Live...');
    try {
        // Lakukan transisi
        await this.youtube.liveBroadcasts.transition({
            part: 'snippet,status',
            id: broadcastId,
            broadcastStatus: 'live',
        });
        console.log('🎉 [YouTube] Broadcast is now LIVE!');
    } catch (e) {
        // Jika gagal karena Invalid Transition, kemungkinan broadcast butuh waktu lebih
        console.error('❌ [YouTube API Error]:', e.response?.data?.error?.message || e.message);
        throw new Error('Gagal transisi broadcast ke Live');
    }
  }

  async _waitForStreamActive(streamId, timeoutMs = 180000, intervalMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await this.youtube.liveStreams.list({
        part: 'status',
        id: streamId,
      });
      const status = res.data.items?.[0]?.status?.streamStatus;
      console.log(`   Stream status: ${status}`);
      if (status === 'active') return;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('Stream tidak aktif setelah 3 menit — pastikan FFmpeg berjalan dan mengirim data ke RTMP URL.');
  }
}

module.exports = YouTubeService;