package com.kplayer.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;

final class PlaybackController {
    interface Listener { void changed(); }

    private final Context context;
    private final SurfaceView surface;
    private final Listener listener;
    private MediaPlayer player;
    private boolean prepared;
    private boolean pendingVideo;
    private String title = "Nada reproduzindo";

    PlaybackController(Context context, SurfaceView surface, Listener listener) {
        this.context = context.getApplicationContext();
        this.surface = surface;
        this.listener = listener;
        surface.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override public void surfaceCreated(SurfaceHolder holder) {
                if (player != null && pendingVideo) {
                    try { player.setDisplay(holder); } catch (Exception ignored) { }
                }
            }
            @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) { }
            @Override public void surfaceDestroyed(SurfaceHolder holder) {
                if (player != null) {
                    try { player.setDisplay(null); } catch (Exception ignored) { }
                }
            }
        });
    }

    void play(MediaItem item) { title = item.title; playUri(item.uri, item.video); }
    void playRadio(String name, String url) { title = name; playUri(Uri.parse(url), false); }

    private void playUri(Uri uri, boolean video) {
        stopAndRelease();
        pendingVideo = video;
        surface.setVisibility(video ? View.VISIBLE : View.GONE);
        try {
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(video ? AudioAttributes.CONTENT_TYPE_MOVIE : AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
            mp.setDataSource(context, uri);
            if (video && surface.getHolder().getSurface() != null && surface.getHolder().getSurface().isValid()) {
                mp.setDisplay(surface.getHolder());
            }
            mp.setOnPreparedListener(ready -> {
                if (player == ready) {
                    prepared = true;
                    try { ready.start(); } catch (Exception ignored) { }
                    listener.changed();
                }
            });
            mp.setOnCompletionListener(done -> listener.changed());
            mp.setOnErrorListener((errPlayer, what, extra) -> {
                if (player == errPlayer) prepared = false;
                listener.changed();
                return true;
            });
            player = mp;
            mp.prepareAsync();
        } catch (Exception ignored) {
            stopAndRelease();
        }
        listener.changed();
    }

    void toggle() {
        if (player == null || !prepared) return;
        try {
            if (player.isPlaying()) player.pause();
            else player.start();
        } catch (IllegalStateException ignored) { }
        listener.changed();
    }

    void seek(long delta) {
        if (player == null || !prepared) return;
        try {
            int target = (int) Math.max(0, player.getCurrentPosition() + delta);
            player.seekTo(target);
        } catch (IllegalStateException ignored) { }
    }

    boolean playing() {
        try { return player != null && prepared && player.isPlaying(); }
        catch (IllegalStateException e) { return false; }
    }

    long time() {
        try { return player != null && prepared ? Math.max(0, player.getCurrentPosition()) : 0; }
        catch (IllegalStateException e) { return 0; }
    }

    long length() {
        try { return player != null && prepared ? Math.max(0, player.getDuration()) : 0; }
        catch (IllegalStateException e) { return 0; }
    }

    String title() { return title; }

    void release() { stopAndRelease(); }

    private void stopAndRelease() {
        prepared = false;
        pendingVideo = false;
        if (player != null) {
            MediaPlayer old = player;
            player = null;
            try { old.setDisplay(null); } catch (Exception ignored) { }
            try { old.stop(); } catch (Exception ignored) { }
            try { old.release(); } catch (Exception ignored) { }
        }
    }
}
