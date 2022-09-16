use dpp::identifier::Identifier;
use wasm_bindgen::prelude::*;

use dpp::identity::state_transition::asset_lock_proof::AssetLockProof;
use dpp::identity::IdentityPublicKey;
use dpp::identity::{Identity, KeyID};
use dpp::metadata::Metadata;

use dpp::util::string_encoding::Encoding;

use serde::{Deserialize, Serialize};

use crate::identifier::IdentifierWrapper;
use crate::MetadataWasm;
use crate::{IdentityPublicKeyWasm, JsPublicKey};

#[wasm_bindgen(js_name=Identity)]
pub struct IdentityWasm(Identity);

#[wasm_bindgen(js_name=AssetLockProof)]
pub struct AssetLockProofWasm(AssetLockProof);
impl From<AssetLockProof> for AssetLockProofWasm {
    fn from(v: AssetLockProof) -> Self {
        AssetLockProofWasm(v)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct JsIdentity {
    pub protocol_version: f32,
    pub id: String,
    pub public_keys: Vec<JsPublicKey>,
    pub balance: f64,
    pub revision: f64,
    // #[serde(skip)]
    // pub asset_lock_proof: Option<AssetLockProof>,
    // #[serde(skip)]
    // pub metadata: Option<Metadata>,
}

impl From<JsIdentity> for Identity {
    fn from(js_identity: JsIdentity) -> Self {
        Identity {
            protocol_version: js_identity.protocol_version as u32,
            id: Identifier::from_string(&js_identity.id, Encoding::Base58).unwrap(),
            // id: Identifier::from_bytes(&js_identity.id).unwrap(),
            public_keys: js_identity
                .public_keys
                .iter()
                .map(|js_key| js_key.into())
                .collect(),
            balance: js_identity.balance as u64,
            revision: js_identity.revision as u64,
            asset_lock_proof: None,
            metadata: None,
        }
    }
}

#[wasm_bindgen(js_class=Identity)]
impl IdentityWasm {
    #[wasm_bindgen(js_name=doStuff)]
    pub fn do_stuff(raw_identity: JsValue) -> Result<js_sys::JsString, JsValue> {
        js_sys::JSON::stringify(&raw_identity)
    }

    #[wasm_bindgen(constructor)]
    pub fn new(raw_identity: JsValue) -> Result<IdentityWasm, JsValue> {
        let identity_json = String::from(js_sys::JSON::stringify(&raw_identity)?);
        let js_identity: JsIdentity = serde_json::from_str(&identity_json).map_err(|e| e.to_string())?;
        let identity = Identity::from(js_identity);
        Ok(IdentityWasm(identity))
    }

    #[wasm_bindgen(js_name=getProtocolVersion)]
    pub fn get_protocol_version(&self) -> u32 {
        self.0.get_protocol_version()
    }

    #[wasm_bindgen(js_name=getId)]
    pub fn get_id(&self) -> IdentifierWrapper {
        self.0.get_id().clone().into()
    }

    #[wasm_bindgen(js_name=setPublicKeys)]
    pub fn set_public_keys(mut self, pub_keys: Vec<JsValue>) -> Self {
        let keys: Vec<IdentityPublicKey> = pub_keys
            .into_iter()
            .map(|v| JsValue::into_serde(&v).expect("unable to convert pub keys"))
            .collect();
        self.0 = self.0.set_public_keys(keys);
        self
    }

    #[wasm_bindgen(js_name=getPublicKeys)]
    pub fn get_public_keys(&self) -> Vec<JsValue> {
        self.0
            .get_public_keys()
            .iter()
            .map(|v| JsValue::from_serde(v).expect("unable to convert pub keys"))
            .collect()
    }

    #[wasm_bindgen(js_name=getPublicKeyById)]
    pub fn get_public_key_by_id(&self, key_id: u32) -> Option<IdentityPublicKeyWasm> {
        let key_id = key_id as KeyID;
        self.0
            .get_public_key_by_id(key_id)
            .map(IdentityPublicKey::to_owned)
            .map(Into::into)
    }

    #[wasm_bindgen(js_name=getBalance)]
    pub fn get_balance(&self) -> u64 {
        self.0.get_balance()
    }

    #[wasm_bindgen(js_name=setBalance)]
    pub fn set_balance(mut self, balance: u64) -> Self {
        self.0 = self.0.set_balance(balance);
        self
    }

    #[wasm_bindgen(js_name=increaseBalance)]
    pub fn increase_balance(mut self, amount: u64) -> Self {
        self.0 = self.0.increase_balance(amount);
        self
    }

    #[wasm_bindgen(js_name=reduceBalance)]
    pub fn reduce_balance(mut self, amount: u64) -> Self {
        self.0 = self.0.reduce_balance(amount);
        self
    }

    #[wasm_bindgen(js_name=setAssetLockProof)]
    pub fn set_asset_lock_proof(mut self, lock: JsValue) -> Self {
        self.0 = self
            .0
            .set_asset_lock_proof(JsValue::into_serde(&lock).unwrap());

        self
    }

    #[wasm_bindgen(js_name=getAssetLockProof)]
    pub fn get_asset_lock_proof(&self) -> Option<AssetLockProofWasm> {
        self.0
            .get_asset_lock_proof()
            .map(AssetLockProof::to_owned)
            .map(Into::into)
    }

    #[wasm_bindgen(js_name=setRevision)]
    pub fn set_revision(mut self, revision: u64) -> Self {
        self.0 = self.0.set_revision(revision);
        self
    }

    #[wasm_bindgen(js_name=getRevision)]
    pub fn get_revision(&self) -> u64 {
        self.0.get_revision()
    }

    #[wasm_bindgen(js_name=getMetadata)]
    pub fn get_metadata(&self) -> Option<MetadataWasm> {
        self.0
            .get_metadata()
            .map(Metadata::to_owned)
            .map(Into::into)
    }

    #[wasm_bindgen(js_name=setMetadata)]
    pub fn set_metadata(mut self, metadata: MetadataWasm) -> Self {
        self.0 = self.0.set_metadata(metadata.into());
        self
    }

    #[wasm_bindgen(js_name=from)]
    pub fn from(object: JsValue) -> Self {
        let i: Identity = serde_json::from_str(&object.as_string().unwrap()).unwrap();
        IdentityWasm(i)
    }

    #[wasm_bindgen(js_name=toJSON)]
    pub fn to_json(&self) -> JsValue {
        JsValue::from_serde(&self.0).unwrap()
    }

    #[wasm_bindgen(js_name=toObject)]
    pub fn to_object(&self) -> JsValue {
        JsValue::from_serde(&self.0).unwrap()
    }

    #[wasm_bindgen(js_name=toString)]
    pub fn to_string(&self) -> String {
        serde_json::to_string(&self.0).unwrap()
    }

    #[wasm_bindgen(js_name=toBuffer)]
    pub fn to_buffer(&self) -> Vec<u8> {
        self.0.to_buffer().unwrap()
    }
}
