const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class YouTubeService {
  constructor() {
    let clientId = process.env.GOOGLE_CLIENT_ID;
    let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    let redirectUri = 'https://aksarastream.ddns.net/auth/google/callback';

    const rootPath = path.resolve(__dirname, '../../');
    const credPath = path.join(rootPath, 'credentials.json');
    
    if (fs.existsSync(credPath)) {
      try {
        const credentials = JSON.parse(fs.readFileSync(credPath));
        const key = credentials.installed ? 'installed' : 'web';
        clientId = credentials[key].client_id;
        clientSecret = credentials[key].client_secret;
        if (credentials[key].redirect_uris && credentials[key].redirect_uris.length > 0) {
            redirectUri = credentials[key].redirect_uris[0];
        }
      } catch(e) {}
    }

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    this.youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });
  }

  async createBroadcast({ refreshToken, title, description, thumbnailPath }) {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    console.log('🎬 [YouTube] Creating Live Broadcast...');
    
    const broadcastRes = await this.youtube.liveBroadcasts.insert({
      part: 'snippet,status,contentDetails',
      requestBody: {
        snippet: {
          title: title || 'Lofi Jazz 24/7',
          description: description || 'Automated Lofi Jazz Stream',
          scheduledStartTime: new Date().toISOString(),
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
        contentDetails: { enableAutoStart: true, enableAutoStop: false, latencyPreference: 'normal' },
      },
    });
    const broadcastId = broadcastRes.data.id;

    console.log('📡 [YouTube] Creating Live Stream (RTMP)...');
    const streamRes = await this.youtube.liveStreams.insert({
      part: 'snippet,cdn,contentDetails',
      requestBody: {
        snippet: { title: `Stream Engine for ${title || broadcastId}` },
        cdn: { frameRate: '30fps', ingestionType: 'rtmp', resolution: '1080p' },
        // KUNCI UTAMA: Agar StreamKey tidak hangus saat putus koneksi sementara
        contentDetails: { isReusable: true } 
      },
    });
    const streamId = streamRes.data.id;
    const rtmpUrl = streamRes.data.cdn.ingestionInfo.ingestionAddress;
    const streamKey = streamRes.data.cdn.ingestionInfo.streamName;

    console.log('🔗 [YouTube] Binding Broadcast to Stream...');
    await this.youtube.liveBroadcasts.bind({ part: 'id,contentDetails', id: broadcastId, streamId: streamId });

    if (thumbnailPath && fs.existsSync(thumbnailPath)) {
      try {
        await this.youtube.thumbnails.set({ videoId: broadcastId, media: { body: fs.createReadStream(thumbnailPath) } });
      } catch (err) {}
    }

    console.log('✅ [YouTube] Broadcast created.');
    return { broadcastId, streamId, rtmpUrl: `${rtmpUrl}/${streamKey}` };
  }

  async goLive({ refreshToken, broadcastId, streamId }) {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    console.log('⏳ [YouTube] Waiting for stream to become active...');
    await this._waitForStreamActive(streamId);
    await new Promise(r => setTimeout(r, 5000));

    const broadcastCheck = await this.youtube.liveBroadcasts.list({ part: 'status', id: broadcastId });
    const broadcastStatus = broadcastCheck.data.items?.[0]?.status?.lifeCycleStatus;

    if (broadcastStatus === 'live') return console.log('✅ [YouTube] Already live!');

    if (broadcastStatus === 'ready') {
      try {
        await this.youtube.liveBroadcasts.transition({ part: 'snippet,status', id: broadcastId, broadcastStatus: 'testing' });
        await new Promise(r => setTimeout(r, 5000));
      } catch (e) {}
    }

    try {
      await this.youtube.liveBroadcasts.transition({ part: 'snippet,status', id: broadcastId, broadcastStatus: 'live' });
      console.log('🎉 [YouTube] Broadcast is now LIVE!');
    } catch (e) {}
  }  

  async endBroadcast({ refreshToken, broadcastId, deleteAfterStream = true }) {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });
      await this.youtube.liveBroadcasts.transition({ part: 'snippet,status', id: broadcastId, broadcastStatus: 'complete' });
      console.log(`✅ [YouTube] Siaran ${broadcastId} telah dihentikan.`);
      
      // Jeda 3 detik membiarkan server YouTube memproses transisi ke VOD
      await new Promise(r => setTimeout(r, 3000));
      
      if (deleteAfterStream) {
        try {
          await this.youtube.videos.delete({ id: broadcastId });
          console.log(`🗑️ [YouTube] VOD ${broadcastId} dihapus permanen (deleteAfterStream=ON).`);
        } catch (delErr) {
          console.log(`⚠️ [YouTube] Gagal hapus permanen, ubah ke Unlisted...`);
          try {
            await this.youtube.videos.update({
              part: "status",
              requestBody: { id: broadcastId, status: { privacyStatus: "unlisted" } }
            });
            console.log(`👁️‍🗨️ [YouTube] VOD ${broadcastId} disembunyikan (Unlisted).`);
          } catch (updErr) {}
        }
      } else {
        console.log(`💾 [YouTube] VOD ${broadcastId} disimpan sebagai publik (deleteAfterStream=OFF).`);
      }
    } catch (err) {}
  }

  async _waitForStreamActive(streamId, timeoutMs = 180000, intervalMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await this.youtube.liveStreams.list({ part: 'status', id: streamId });
      if (res.data.items?.[0]?.status?.streamStatus === 'active') return;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('Stream tidak aktif setelah 3 menit.');
  }
}
module.exports = YouTubeService;
