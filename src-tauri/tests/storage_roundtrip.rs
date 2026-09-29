// Note: requires OS keyring access. Run with `cargo test -- --ignored`.
use std::sync::Mutex;
use tempfile::TempDir;
use unbreakable_lib::crypto::storage::{HistoryEntry, VaultStore};

// Keyring operations are process-global; serialize tests to avoid KEK race.
static KEYRING_LOCK: Mutex<()> = Mutex::new(());

fn sample_entries() -> Vec<HistoryEntry> {
    vec![
        HistoryEntry {
            id: "01HXTEST00000001".into(),
            kind: "password".into(),
            value: "Tr0ub4dor&3-test-secret".into(),
            label: Some("acme".into()),
            score: 4,
            created_at: "2026-05-26T10:00:00Z".into(),
        },
        HistoryEntry {
            id: "01HXTEST00000002".into(),
            kind: "passphrase".into(),
            value: "correct-horse-battery-staple-2".into(),
            label: None,
            score: 4,
            created_at: "2026-05-26T10:01:00Z".into(),
        },
    ]
}

#[test]
#[ignore]
fn roundtrip_without_master_pw() {
    let _guard = KEYRING_LOCK.lock().unwrap();
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("history.bin");

    {
        let mut v = VaultStore::open(path.clone(), None).unwrap();
        v.save(&sample_entries()).unwrap();
    }

    let v2 = VaultStore::open(path.clone(), None).unwrap();
    let loaded = v2.load().unwrap();
    assert_eq!(loaded.len(), 2);
    assert_eq!(loaded[0].id, "01HXTEST00000001");
    assert_eq!(loaded[1].kind, "passphrase");
}

#[test]
#[ignore]
fn rotate_master_password_then_reopen_succeeds() {
    let _g = KEYRING_LOCK.lock().unwrap();
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("history.bin");

    // Initial save without master pw
    {
        let mut v = VaultStore::open(path.clone(), None).unwrap();
        v.save(&sample_entries()).unwrap();
    }

    // Enable master pw via rotate
    {
        let mut v = VaultStore::open(path.clone(), None).unwrap();
        v.rotate_master_password(Some("newmasterpw")).unwrap();
    }

    // Reopen with the new master pw and verify entries decrypt correctly
    let v3 = VaultStore::open(path.clone(), Some("newmasterpw")).unwrap();
    let loaded = v3.load().unwrap();
    assert_eq!(loaded.len(), 2);
    assert_eq!(loaded[0].id, "01HXTEST00000001");
}

#[test]
#[ignore]
fn wrong_master_pw_rejected() {
    let _guard = KEYRING_LOCK.lock().unwrap();
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("history.bin");

    {
        let mut v = VaultStore::open(path.clone(), Some("correctpassword")).unwrap();
        v.save(&sample_entries()).unwrap();
    }

    let v2 = VaultStore::open(path.clone(), Some("WRONGPASSWORD"));
    let result = v2.and_then(|s| s.load());
    assert!(
        result.is_err(),
        "expected decrypt failure with wrong password"
    );
}
