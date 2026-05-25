use crate::crypto::{
    generate_passphrase, generate_password, PassphraseOptions, PasswordOptions,
};
use crate::errors::Result;

#[tauri::command]
pub fn cmd_generate_password(opts: Option<PasswordOptions>) -> Result<String> {
    generate_password(&opts.unwrap_or_default())
}

#[tauri::command]
pub fn cmd_generate_passphrase(opts: Option<PassphraseOptions>) -> Result<String> {
    generate_passphrase(&opts.unwrap_or_default())
}

#[tauri::command]
pub fn cmd_generate_pair(
    pwd_opts: Option<PasswordOptions>,
    phrase_opts: Option<PassphraseOptions>,
) -> Result<(String, String)> {
    let p = generate_password(&pwd_opts.unwrap_or_default())?;
    let ph = generate_passphrase(&phrase_opts.unwrap_or_default())?;
    Ok((p, ph))
}
