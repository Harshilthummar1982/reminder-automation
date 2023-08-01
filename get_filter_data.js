const admin = require('firebase-admin');
var serviceAccount = require("./serviceAccountKey.json");
const fs = require('fs');
const axios = require('axios');
const accessToken = 'EAAUapFPYJ7oBADL3blRDiyJU7uZCuuhffmt4lxEhXJwvEkZBcRWbYnwt8S7dVzdhku8k1AjNJFqoNkhJUeBp6xGZChGQ4eVNY222Xi5MZAZAEGFLbZBRGoZBO0OSKa41BZCMtuiZAQ2TRdMeQem7ZCifkP7ClzZCqcyJvHz1Ao7Q83ASXjSmmWAyc0UqWM8yP8Xb0oImjG0aZCiccAZDZD';


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const snapshotref = admin.firestore().collectionGroup('Policy');
const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
let i=0;

(async () => {
    const clientsSnapshot = await snapshotref.get();

    await Promise.all(clientsSnapshot.docs.map(async (doc) => {
        i++;
        const expirationDate = doc.data().eDate.toDate();
        const currentDate = new Date();
        const daysToExpiration = Math.floor((expirationDate - currentDate) / (1000 * 60 * 60 * 24));


        const documentData = doc.data();

        if ([30, 15, 7].includes(daysToExpiration)) {

            // consoe.log(documentData);
            
            if (documentData.remOn == false) {
                // Continue to the next iteration if remOn is false
                console.log(documentData.uid, "continue");
                return;
            }
            documentData.duration = daysToExpiration;
            if (daysToExpiration === 30) {
                documentData.nuOfRem = "first";
            }
            else if (daysToExpiration === 15) {
                documentData.nuOfRem = "second";
            } else {
                documentData.nuOfRem = "third";
            }
            documentData.policyDocId = doc.id;

            const clientID = documentData.cid;
            const userID = documentData.uid;
            const usersRef = admin.firestore().collection(`clients/${clientID}/users`).doc(userID);
            const userSnapshot = await usersRef.get();
            if (userSnapshot.exists) {
                const userData = userSnapshot.data();
                documentData.mobile = userData.personal.mobile.replace(/\D/g, '');;
                documentData.name = userData.personal.name;
                documentData.sDate = expirationDate.toLocaleDateString('en-GB', options);
                documentData.eDate = expirationDate.toLocaleDateString('en-GB', options);
                let nor = 0;

                if (userData.nor) {
                    nor = userData.nor;
                }

                nor += 1;

                documentData.nor = nor
                // console.log(documentData);
                
                // filteredDocuments.push(documentData);
                sendMessageToUsers(documentData);

            }
        }
    }));

    // console.log("Filtered Documents:", filteredDocuments);
})();


function capitalizeFirstLetter(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}



async function sendMessageToUsers(reminderData) {
    // console.log(reminderData.mobile);
    // console.log(reminderData.policyDocId);
    // console.log(reminderData);

    try {

        const response = await axios.post(
            'https://graph.facebook.com/v17.0/101159073035070/messages',
            {
                messaging_product: 'whatsapp',
                to: reminderData.mobile,
                type: 'template',
                template: {
                    name: 'policy_reminder',
                    language: { code: 'en_US' },
                    components: [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: capitalizeFirstLetter(reminderData.type) }, // Replace with your variable values
                                { type: 'text', text: reminderData.name },
                                { type: 'text', text: reminderData.policyType },
                                { type: 'text', text: reminderData.policyNumber },
                                { type: 'text', text: reminderData.eDate },
                                { type: 'text', text: reminderData.premiumAmount },
                                { type: 'text', text: '+91 9375563063' },
                                { type: 'text', text: 'Vijaybhai P. Kathiriya' },
                                { type: 'text', text: 'Aarogyam Insurance' }
                                // { type: 'text', text: capitalizeFirstLetter(reminderData.type) }, // Replace with your variable values
                                // { type: 'text', text: 'Devidbhai Tandelbhai Thunder' },
                                // { type: 'text', text: 'Jivan Saral' },
                                // { type: 'text', text: '235AB68T3C38' },
                                // { type: 'text', text: '25/02/2023' },
                                // { type: 'text', text: '2044.20' },
                                // { type: 'text', text: '+91 9876543210' },
                                // { type: 'text', text: 'pinkiben Eralben Panday' },
                            ],
                        },
                    ],
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log(`${reminderData.name}, ${reminderData.nuOfRem} reminder  to : ${reminderData.mobile} from aroguam insorance`);
        const userRef = admin.firestore().collection(`clients/${reminderData.cid}/users`).doc(reminderData.uid);
        await userRef.update(
            { "nor": reminderData.nor },
            { merge: true },
        );

        const policyRef = admin.firestore().collection(`clients/${reminderData.cid}/users/${reminderData.uid}/Policy`).doc(reminderData.policyDocId);
        await policyRef.update(
            {
                [`reminders.${reminderData.duration}`]: true
            }, { merge: true }
        )

        // Add reminder document
        const reminderRef = admin.firestore().collection(`clients/${reminderData.cid}/reminders`);

        const newReminder = {
            uid: reminderData.uid,
            pid: reminderData.pid,
            name: reminderData.name,
            policyDocId: reminderData.policyDocId,
            premiumAmount: reminderData.premiumAmount,
            plateform: "WA",
            duration: reminderData.duration,
            type: reminderData.type,
            mid: response.data.messages[0].id,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        try {
            await reminderRef.add(newReminder);
            console.log(`Reminder added successfully , ${newReminder.uid}`);
        } catch (error) {
            console.error(`Error adding reminder (${newReminder.uid}): `, error);
        }

    } catch (error) {
        console.error(`Error sending message to ${reminderData.mobile}:`, error.message);
        logError(error.message, reminderData.mobile);
    }
}

function logError(errorMessage, mobile) {
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split('T')[0];
    const logFilename = `error_${formattedDate}.log`;

    fs.appendFileSync(logFilename, `mobile : ${mobile} , ${currentDate.toISOString()}: ${errorMessage}\n`);
}