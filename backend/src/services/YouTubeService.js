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
    this.oauth2Client.setCredentials({ 
      refresh_token: refreshToken,
      scope: [
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/youtube.force-ssl',
        'https://www.googleapis.com/auth/youtubepartner'
      ].join(' ')
    });

    console.log('🎬 [YouTube] Creating Live Broadcast...');
    console.log('📝 [YouTube] Title:', title);
    console.log('📝 [YouTube] Description:', description ? description.substring(0, 80) + '...' : 'none');
    
    const broadcastRes = await this.youtube.liveBroadcasts.insert({
      part: 'snippet,status,contentDetails',
      requestBody: {
        snippet: {
          title: title || 'Lofi Jazz 24/7',
          description: description || 'Automated Lofi Jazz Stream',
          scheduledStartTime: new Date().toISOString(),
        },
        status: { 
          privacyStatus: 'public', 
          selfDeclaredMadeForKids: false
          
        },
        contentDetails: { 
          enableAutoStart: true, 
          enableAutoStop: false, 
          latencyPreference: 'normal',
          enableMonitorStream: false
        },
      },
    });
    const broadcastId = broadcastRes.data.id;
    console.log('✅ [YouTube] Broadcast created:', broadcastId);

    console.log('📡 [YouTube] Creating Live Stream (RTMP)...');
    const streamRes = await this.youtube.liveStreams.insert({
      part: 'snippet,cdn,contentDetails',
      requestBody: {
        snippet: { title: `Stream Engine for ${title || broadcastId}` },
        cdn: { frameRate: '30fps', ingestionType: 'rtmp', resolution: '1080p' },
        contentDetails: { isReusable: true } 
      },
    });
    const streamId = streamRes.data.id;
    const rtmpUrl = streamRes.data.cdn.ingestionInfo.ingestionAddress;
    const streamKey = streamRes.data.cdn.ingestionInfo.streamName;

    console.log('🔗 [YouTube] Binding Broadcast to Stream...');
    await this.youtube.liveBroadcasts.bind({ 
      part: 'id,contentDetails', 
      id: broadcastId, 
      streamId: streamId 
    });

    // Enable Monetization via status update
    try {
      await this.youtube.videos.update({
        part: 'status',
        requestBody: {
          id: broadcastId,
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
            embeddable: true,
            license: 'youtube',
            publicStatsViewable: true
          }
        }
      });

      // Try monetization via youtubepartner scope
      const youtube2 = google.youtube({ version: 'v3', auth: this.oauth2Client });
      await youtube2.videos.update({
        part: 'monetizationDetails',
        requestBody: {
          id: broadcastId,
          monetizationDetails: {
            access: { allowed: true }
          }
        }
      });
      console.log('💰 [YouTube] Monetization enabled:', broadcastId);
    } catch (err) {
      console.warn('⚠️ [YouTube] Monetization gagal (pastikan channel eligible YPP):', err.message);
    }

    if (thumbnailPath && fs.existsSync(thumbnailPath)) {
      try {
        await this.youtube.thumbnails.set({ 
          videoId: broadcastId, 
          media: { body: fs.createReadStream(thumbnailPath) } 
        });
        console.log('🖼️ [YouTube] Thumbnail set:', path.basename(thumbnailPath));
      } catch (err) {
        console.warn('⚠️ [YouTube] Thumbnail gagal:', err.message);
      }
    }

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
        await this.youtube.liveBroadcasts.transition({ 
          part: 'snippet,status', 
          id: broadcastId, 
          broadcastStatus: 'testing' 
        });
        await new Promise(r => setTimeout(r, 5000));
      } catch (e) {}
    }

    try {
      await this.youtube.liveBroadcasts.transition({ 
        part: 'snippet,status', 
        id: broadcastId, 
        broadcastStatus: 'live' 
      });
      console.log('🎉 [YouTube] Broadcast is now LIVE!');
    } catch (e) {
      console.warn('⚠️ [YouTube] Transition to live gagal:', e.message);
    }
  }  

  async endBroadcast({ refreshToken, broadcastId, deleteAfterStream = true }) {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });
      await this.youtube.liveBroadcasts.transition({ 
        part: 'snippet,status', 
        id: broadcastId, 
        broadcastStatus: 'complete' 
      });
      console.log(`✅ [YouTube] Siaran ${broadcastId} telah dihentikan.`);
      
      await new Promise(r => setTimeout(r, 3000));
      
      if (deleteAfterStream) {
        try {
          await this.youtube.videos.delete({ id: broadcastId });
          console.log(`🗑️ [YouTube] VOD ${broadcastId} dihapus permanen.`);
        } catch (delErr) {
          try {
            await this.youtube.videos.update({
              part: "status",
              requestBody: { id: broadcastId, status: { privacyStatus: "unlisted" } }
            });
            console.log(`👁️‍🗨️ [YouTube] VOD ${broadcastId} disembunyikan (Unlisted).`);
          } catch (updErr) {}
        }
      } else {
        console.log(`💾 [YouTube] VOD ${broadcastId} disimpan sebagai publik.`);
      }
    } catch (err) {
      console.warn('⚠️ [YouTube] endBroadcast error:', err.message);
    }
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

  async getLiveViewerCount({ refreshToken, videoId }) {
    if (!videoId) return { concurrentViewers: null, totalViews: null };
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    try {
      const res = await this.youtube.videos.list({
        part: 'liveStreamingDetails,statistics',
        id: videoId,
      });
      const item = res.data.items?.[0];
      if (!item) return { concurrentViewers: null, totalViews: null };
      return {
        concurrentViewers: item.liveStreamingDetails?.concurrentViewers
          ? Number(item.liveStreamingDetails.concurrentViewers) : null,
        totalViews: item.statistics?.viewCount
          ? Number(item.statistics.viewCount) : null,
      };
    } catch (err) {
      console.error('[YouTube] getLiveViewerCount error:', err.message);
      return { concurrentViewers: null, totalViews: null };
    }
  }
}

module.exports = YouTubeService;
