const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class YouTubeApiService {
  constructor() {
    // Arahkan ke root backend (naik 2 level: dari src/services ke backend/)
    const rootPath = path.resolve(__dirname, '../../');
    
    const credPath = path.join(rootPath, 'credentials.json');
    const tokenPath = path.join(rootPath, 'token.json');

    if (!fs.existsSync(credPath)) throw new Error(`File credentials.json tidak ditemukan di ${credPath}`);
    if (!fs.existsSync(tokenPath)) throw new Error(`File token.json tidak ditemukan di ${tokenPath}`);

    const credentials = JSON.parse(fs.readFileSync(credPath));
    const token = JSON.parse(fs.readFileSync(tokenPath));
    
    const key = credentials.installed ? 'installed' : 'web';
    const { client_id, client_secret, redirect_uris } = credentials[key];
    
    this.oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    this.oAuth2Client.setCredentials(token);
    this.youtube = google.youtube({ version: 'v3', auth: this.oAuth2Client });
  }

  async createLiveEvent(title, description) {
    const res = await this.youtube.liveBroadcasts.insert({
      part: 'snippet,contentDetails,status',
      requestBody: {
        snippet: {
          title: title,
          description: description,
          scheduledStartTime: new Date().toISOString(),
        },
        status: { privacyStatus: 'public' },
        contentDetails: { enableAutoStart: true, enableAutoStop: true }
      }
    });
    return res.data;
  }

  async updateThumbnail(broadcastId, thumbnailPath) {
    await this.youtube.thumbnails.set({
      videoId: broadcastId,
      media: { body: fs.createReadStream(thumbnailPath) }
    });
  }
} // <--- Cuma butuh satu penutup class di sini

module.exports = new YouTubeApiService();