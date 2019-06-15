const _ = require('lodash');
const jsonpatch = require('fast-json-patch');

const verifyOperationSignature = require('../../func/verifyOperationSignature');
const payloadToHash = require('../../func/payloadToHash');

const { applyReducer } = jsonpatch;
module.exports = async (state, anchoredOperation) => {
  const { transaction, operation } = anchoredOperation;
  if (state.deleted) {
    console.log('deleted, skipping');
    return state;
  }

  const { didUniqueSuffix, previousOperationHash, patch } = operation.decodedOperationPayload;

  const uid = didUniqueSuffix;

  if (!state[uid]) {
    throw new Error('Cannot update a DID that does not exist.');
  }

  const preUpdateDidDoc = state[uid].doc;

  const { kid } = operation.decodedOperation.header;

  const signingKey = _.find(preUpdateDidDoc.publicKey, pubKey => pubKey.id === kid);

  if (state[uid].previousOperationHash !== previousOperationHash) {
    throw new Error('previousOperationHash is not correct, update invalid');
  }

  if (!signingKey) {
    throw new Error('Cannot find kid in doc, update invalid.');
  }

  const isSignatureValid = await verifyOperationSignature({
    encodedOperationPayload: operation.decodedOperation.payload,
    signature: operation.decodedOperation.signature,
    publicKey: signingKey.publicKeyHex,
  });

  if (!isSignatureValid) {
    throw new Error('Signature is not valid.');
  }

  patch.forEach((p) => {
    const patchPointedData = jsonpatch.getValueByPointer(preUpdateDidDoc, p.path);
    if (patchPointedData && patchPointedData.id && patchPointedData.id === '#recovery') {
      throw new Error('Cannot change #recovery with update.');
    }
  });

  const updatedDoc = patch.reduce(applyReducer, preUpdateDidDoc);

  const newPreviousOperationHash = payloadToHash(operation.decodedOperationPayload);

  return {
    ...state,
    [uid]: {
      ...state[uid],
      doc: updatedDoc,
      previousOperationHash: newPreviousOperationHash,
      lastTransactionTime: transaction.transactionTime,
    },
  };
};
