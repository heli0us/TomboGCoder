// Windows のリリースビルド時に余計なコンソールウィンドウを出さない設定
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tombo_gcoder_lib::run()
}
