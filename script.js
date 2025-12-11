
window.onerror = function (msg, url, line, col, error) {
    const status = document.getElementById('status');
    if (status) {
        status.innerHTML = `ERR: ${msg} <br> L${line}`;
        status.style.color = 'red';
        status.style.background = 'white';
    }
    console.error(error);
};

// --- 状態管理用変数 ---
let lastProcessedTimestamp = "";

// --- 音声AI統合用変数 ---
const SERVER_URL = "wss://chase-unpatient-denice.ngrok-free.dev/ws";
const TOKEN = "my_secret_token_123";

let socket = null;
let audioContext = null;
let nextStartTime = 0;

// --- シーン初期化時の処理 ---
document.addEventListener('DOMContentLoaded', function () {
    const scene = document.querySelector('a-scene');

    // 音声接続ボタンのイベントリスナー
    document.getElementById('connect-btn').onclick = async () => {
        await initAudio();
        connectWebSocket();
    };

    if (scene) {
        scene.addEventListener('loaded', () => {
            // --- モデル参照 ---
            // Stage 3 Models
            const stage3IdleModel = document.querySelector('#stage3-idle-model');
            const stage3HappyModel = document.querySelector('#stage3-happy-model');
            const stage3AngryModel = document.querySelector('#stage3-angry-model');

            // Groups
            const chibiGroup = document.querySelector('#chibi-group');
            const buddyGroup = document.querySelector('#buddy-group'); // Stage 2
            const stage3Group = document.querySelector('#stage3-group'); // Stage 3

            // Chibi Models
            const joyfulModel = document.querySelector('#joyful-model');
            const happy1Model = document.querySelector('#happy-1-model');
            const happy2Model = document.querySelector('#happy-2-model');
            const happy3Model = document.querySelector('#happy-3-model');
            const angryModel = document.querySelector('#angry-model');

            // Buddy Models
            const buddyIdleModel = document.querySelector('#buddy-idle-model');
            const buddyHappy1Model = document.querySelector('#buddy-happy-1-model');
            const buddyHappy2Model = document.querySelector('#buddy-happy-2-model');
            const buddyAngryModel = document.querySelector('#buddy-angry-model');

            const angerIcon = document.querySelector('#anger-icon');
            const heartIcon = document.querySelector('#heart-icon');

            // 全モデルの配列
            const allModels = [
                joyfulModel, happy1Model, happy2Model, happy3Model, angryModel,
                buddyIdleModel, buddyHappy1Model, buddyHappy2Model, buddyAngryModel,
                stage3IdleModel, stage3HappyModel, stage3AngryModel
            ];

            // --- 召喚ロジック変数 ---
            const summonBtn = document.getElementById('summon-btn');
            const wbfMarker = document.querySelector('a-marker[url*="pattern-WBF"]');
            const hiroMarker = document.querySelector('a-marker[preset="hiro"]');
            const buddyModel = document.querySelector('a-marker[preset="hiro"] > a-gltf-model');

            // 召喚状態フラグ
            let isSummoned = false;
            let currentEvolutionStage = 0; // 0: Chibi, 1: Recycle Buddy, 2: Super Buddy
            let recycleBuddyModel = null; // WBFマーカー上のRecycle Buddyモデル
            let currentEmotion = null; // 現在のエモーション
            let emotionTimeout = null; // エモーション終了後のタイムアウト
            let summonTimestamp = 0; // 召喚時刻 (Session Start)
            let lastStageChangeTimestamp = 0; // 最終進化/退化時刻 (Strict consecutive check)
            let lastProcessedTimestamp = 0; // The timestamp of the last processed record
            let isFirstPoll = false; // Flag to sync timestamp on first poll

            // --- 全モデルを非表示にする関数 ---
            function hideAllModels() {
                allModels.forEach(model => {
                    if (model) {
                        model.setAttribute('visible', false);
                    }
                });
                // AR空間のアイコンを非表示
                if (angerIcon) angerIcon.setAttribute('visible', false);
                if (heartIcon) heartIcon.setAttribute('visible', false);
                // 画面固定のアイコンを非表示
                hideEmotionIcons();
            }

            // --- 画面固定の感情アイコンを表示 ---
            function showEmotionIcons(emotion) {
                const overlay = document.getElementById('emotion-overlay');
                overlay.style.display = 'block';
                overlay.innerHTML = ''; // クリア

                const icon = emotion === 'happy' ? '❤' : (emotion === 'celebrate' ? '🎉' : '💢');
                const iconCount = 8; // アイコンの数

                for (let i = 0; i < iconCount; i++) {
                    const iconElement = document.createElement('div');
                    iconElement.className = 'emotion-icon';
                    iconElement.textContent = icon;

                    if (emotion === 'happy') {
                        iconElement.style.color = '#FF69B4'; // ホットピンク
                    } else if (emotion === 'celebrate') {
                        iconElement.style.color = '#FFD700'; // ゴールド
                    }

                    // ランダムな位置に配置
                    iconElement.style.left = `${Math.random() * 80 + 10}%`;
                    iconElement.style.top = `${Math.random() * 70 + 15}%`;
                    iconElement.style.animationDelay = `${Math.random() * 0.5}s`;

                    overlay.appendChild(iconElement);
                }

                // 3秒後に非表示
                setTimeout(() => {
                    hideEmotionIcons();
                }, 3000);
            }

            // --- 画面固定の感情アイコンを非表示 ---
            function hideEmotionIcons() {
                const overlay = document.getElementById('emotion-overlay');
                overlay.style.display = 'none';
                overlay.innerHTML = '';
            }

            // --- Joyful（待機状態）を表示 ---
            function showJoyful() {
                if (!isSummoned) return;

                hideAllModels(); // まず全モデル非表示

                if (currentEvolutionStage === 2) {
                    // Stage 3: Super Buddy
                    if (stage3Group) stage3Group.setAttribute('visible', true);
                    if (buddyGroup) buddyGroup.setAttribute('visible', false);
                    if (chibiGroup) chibiGroup.setAttribute('visible', false);

                    if (stage3IdleModel) {
                        stage3IdleModel.setAttribute('visible', true);
                        if (stage3IdleModel.components['animation-mixer']) {
                            stage3IdleModel.components['animation-mixer'].play();
                        }
                    }
                } else if (currentEvolutionStage === 1) {
                    // Stage 2: Recycle Buddy
                    if (stage3Group) stage3Group.setAttribute('visible', false);
                    if (buddyGroup) buddyGroup.setAttribute('visible', true);
                    if (chibiGroup) chibiGroup.setAttribute('visible', false);

                    if (buddyIdleModel) {
                        buddyIdleModel.setAttribute('visible', true);
                        if (buddyIdleModel.components['animation-mixer']) {
                            buddyIdleModel.components['animation-mixer'].play();
                        }
                    }
                } else {
                    // Stage 0: Chibi
                    if (stage3Group) stage3Group.setAttribute('visible', false);
                    if (buddyGroup) buddyGroup.setAttribute('visible', false);
                    if (chibiGroup) chibiGroup.setAttribute('visible', true);

                    joyfulModel.setAttribute('visible', true);
                    joyfulModel.setAttribute('scale', '3 3 3'); // Force scale
                    if (joyfulModel.components['animation-mixer']) {
                        joyfulModel.components['animation-mixer'].play();
                    }
                }
            }

            // --- 赤色ティント適用関数 ---
            function applyRedTint(modelElement) {
                const mesh = modelElement.getObject3D('mesh');
                if (!mesh) return;
                mesh.traverse((node) => {
                    if (node.isMesh) {
                        node.material.color.setHex(0xFF0000); // Pure Red
                        node.material.emissive.setHex(0xFF0000); // Glowing Red
                        node.material.emissiveIntensity = 2.0;   // High Intensity
                    }
                });
            }

            // --- モデル切り替え関数（ランダム選択 + バディ対応） ---
            function showModel(emotion) {
                // console.log(`showModel: ${emotion}, Stage: ${currentEvolutionStage}`);
                if (!isSummoned) return;

                // 既存のタイムアウトをクリア
                if (emotionTimeout) {
                    clearTimeout(emotionTimeout);
                    emotionTimeout = null;
                }

                hideAllModels(); // 全モデル非表示
                currentEmotion = emotion;

                // グループ表示切り替え
                if (currentEvolutionStage === 2) {
                    if (stage3Group) stage3Group.setAttribute('visible', true);
                    if (buddyGroup) buddyGroup.setAttribute('visible', false);
                    if (chibiGroup) chibiGroup.setAttribute('visible', false);
                } else if (currentEvolutionStage === 1) {
                    if (stage3Group) stage3Group.setAttribute('visible', false);
                    if (buddyGroup) buddyGroup.setAttribute('visible', true);
                    if (chibiGroup) chibiGroup.setAttribute('visible', false);
                } else {
                    if (stage3Group) stage3Group.setAttribute('visible', false);
                    if (buddyGroup) buddyGroup.setAttribute('visible', false);
                    if (chibiGroup) chibiGroup.setAttribute('visible', true);
                }


                if (emotion === 'happy') {
                    if (currentEvolutionStage === 2) {
                        // --- Stage 3 Happy ---
                        stage3HappyModel.setAttribute('visible', true);
                        if (stage3HappyModel.components['animation-mixer']) {
                            stage3HappyModel.components['animation-mixer'].play();
                        }
                        // Happy Effect for Stage 3 (Gold Tint)
                        const mesh = stage3HappyModel.getObject3D('mesh');
                        if (mesh) {
                            mesh.traverse((node) => {
                                if (node.isMesh) {
                                    node.material.color.setHex(0xFFD700); // Gold
                                    node.material.emissive.setHex(0xFFD700);
                                    node.material.emissiveIntensity = 0.5;
                                }
                            });
                        }
                    } else if (currentEvolutionStage === 1) {
                        // --- Stage 2 Happy (Random) ---
                        const rand = Math.random();
                        let randomHappy;
                        if (rand < 0.5) randomHappy = buddyHappy1Model;
                        else randomHappy = buddyHappy2Model;

                        randomHappy.setAttribute('visible', true);
                        if (randomHappy.components['animation-mixer']) {
                            randomHappy.components['animation-mixer'].play();
                        }
                    } else {
                        // --- Stage 0 Chibi Happy (Random) ---
                        const rand = Math.random();
                        let randomHappy;
                        if (rand < 0.33) randomHappy = happy1Model;
                        else if (rand < 0.66) randomHappy = happy2Model;
                        else randomHappy = happy3Model;

                        randomHappy.setAttribute('visible', true);
                        randomHappy.setAttribute('scale', '3 3 3');
                        if (randomHappy.components['animation-mixer']) {
                            randomHappy.components['animation-mixer'].play();
                        }
                    }

                    // 共通: 固定アイコン
                    showEmotionIcons('happy');

                    // 3秒後に戻る
                    emotionTimeout = setTimeout(() => {
                        showJoyful();
                    }, 3000);

                } else if (emotion === 'angry') {
                    if (currentEvolutionStage === 2) {
                        // --- Stage 3 Angry ---
                        stage3AngryModel.setAttribute('visible', true);
                        if (stage3AngryModel.components['animation-mixer']) {
                            stage3AngryModel.components['animation-mixer'].play();
                        }
                        applyRedTint(stage3AngryModel);
                    } else if (currentEvolutionStage === 1) {
                        // --- Stage 2 Angry ---
                        buddyAngryModel.setAttribute('visible', true);
                        if (buddyAngryModel.components['animation-mixer']) {
                            buddyAngryModel.components['animation-mixer'].play();
                        }
                        applyRedTint(buddyAngryModel);
                    } else {
                        // --- Stage 0 Chibi Angry ---
                        angryModel.setAttribute('visible', true);
                        angryModel.setAttribute('scale', '3 3 3');
                        if (angryModel.components['animation-mixer']) {
                            angryModel.components['animation-mixer'].play();
                        }
                        applyRedTint(angryModel);
                    }

                    // 共通: 固定アイコン
                    showEmotionIcons('angry');

                    // 3秒後に戻る
                    emotionTimeout = setTimeout(() => {
                        showJoyful();
                    }, 3000);
                }
            }

            // 喜び表現（手動ボタン）
            document.getElementById('happy-btn').addEventListener('click', function () {
                if (!isSummoned) {
                    isSummoned = true;
                    summonBtn.style.display = 'none';
                }
                showModel('happy');
            });

            // 怒り表現（手動ボタン）
            document.getElementById('angry-btn').addEventListener('click', function () {
                if (!isSummoned) {
                    isSummoned = true;
                    summonBtn.style.display = 'none';
                }
                showModel('angry');
            });

            // --- シンプルなエフェクト関数 ---
            function showEffect(markerElement) {
                // console.log('✨ Effect triggered!');
            }

            let currentVisibleMarker = null;
            let currentTargetModel = null;

            // --- マーカー検出時の処理 ---
            function handleMarkerFound(marker, model) {
                currentVisibleMarker = marker;
                currentTargetModel = model;

                // Debug log
                if (document.getElementById('message-box')) {
                    // document.getElementById('message-box').innerText = "Marker Found!";
                }

                if (!isSummoned) {
                    // 召喚前：ボタンを表示、モデルを隠す
                    summonBtn.style.display = 'block';
                    hideAllModels();
                } else {
                    // 既に召喚済みなら、Joyfulまたは現在のエモーションを表示
                    if (marker === wbfMarker) {
                        if (currentEmotion) {
                            showModel(currentEmotion);
                        } else {
                            showJoyful();
                        }
                    } else if (currentTargetModel) {
                        currentTargetModel.setAttribute('visible', true);
                    }
                }
            }

            // --- マーカーロスト時の処理 ---
            function handleMarkerLost() {
                summonBtn.style.display = 'none';
                // isSummonedはリセットしない（一度召喚したら次回も表示）

                // エモーション状態をリセット（再検出時は待機状態に戻す）
                currentEmotion = null;

                // 全モデル非表示
                hideAllModels();
                if (currentTargetModel) currentTargetModel.setAttribute('visible', false);
                if (buddyModel) buddyModel.setAttribute('visible', false);

                currentVisibleMarker = null;
                currentTargetModel = null;
            }

            // イベントリスナー登録 (マーカーがある場合のみ)
            if (wbfMarker) {
                wbfMarker.addEventListener('markerFound', () => {
                    handleMarkerFound(wbfMarker, null);
                });
                wbfMarker.addEventListener('markerLost', handleMarkerLost);
            }

            if (hiroMarker) {
                hiroMarker.addEventListener('markerFound', () => {
                    handleMarkerFound(hiroMarker, buddyModel);
                });
                hiroMarker.addEventListener('markerLost', handleMarkerLost);
            }

            // --- 召喚ボタンクリックイベント ---
            summonBtn.addEventListener('click', () => {
                if (currentVisibleMarker) {
                    summonBtn.style.display = 'none';
                    isSummoned = true; // フラグON

                    // Joyful（待機状態）を表示
                    if (currentVisibleMarker === wbfMarker) {
                        showJoyful();
                    } else if (currentTargetModel) {
                        // Hiroマーカーの場合も非表示
                        currentTargetModel.setAttribute('visible', false);
                    }

                    // 過去のデータを無視するために、フラグを立てる
                    isFirstPoll = true;
                    // Reset stage change timestamp on summon
                    lastStageChangeTimestamp = 0;
                    console.log('Summoned! Timestamp Reset.');
                    showMessage('召喚成功！データを待っています...');
                } else {
                    // マーカーが見つからない場合
                    console.warn("Summon clicked but no marker visible.");
                    // alert("マーカーをカメラに映してからボタンを押してください！"); // Removed alert for cleaner UX
                    if (document.getElementById('status')) {
                        document.getElementById('status').innerText = "マーカーが見つかりません";
                        document.getElementById('status').style.color = 'red';
                    }
                }
            });

            // --- API設定 ---
            let API_ENDPOINT = '';
            const USER_ID = 'webapp_user';

            // 設定を読み込む
            async function loadConfig() {
                try {
                    const response = await fetch('./amplify_outputs.json');
                    const config = await response.json();
                    if (config.custom && config.custom.API) {
                        const apiName = Object.keys(config.custom.API)[0];
                        API_ENDPOINT = config.custom.API[apiName].endpoint;
                        // 末尾のスラッシュを削除
                        if (API_ENDPOINT.endsWith('/')) {
                            API_ENDPOINT = API_ENDPOINT.slice(0, -1);
                        }
                        console.log('API Endpoint loaded:', API_ENDPOINT);
                    } else {
                        console.warn('API configuration not found in amplify_outputs.json');
                    }
                } catch (error) {
                    console.error('設定ファイルの読み込みエラー:', error);
                }
            }

            loadConfig();

            // --- メッセージ表示関数 (Typewriter Effect) ---
            let messageTypewriterTimeout = null;
            function showMessage(text) {
                const messageBox = document.getElementById('message-box');
                if (!messageBox) return;

                // 既存の表示処理をキャンセル
                if (messageTypewriterTimeout) {
                    clearTimeout(messageTypewriterTimeout);
                    messageTypewriterTimeout = null;
                }

                messageBox.innerText = ''; // クリア

                let i = 0;
                const speed = 50; // 1文字あたりの表示速度 (ms)

                function type() {
                    if (i < text.length) {
                        messageBox.innerText += text.charAt(i);
                        i++;
                        messageTypewriterTimeout = setTimeout(type, speed);
                    }
                }
                type();
            }

            // --- DBから感情データを取得する関数 ---
            async function checkEmotionData() {
                if (!isSummoned) return; // 召喚前は何もしない
                if (!API_ENDPOINT) return;

                try {
                    // キャッシュ回避のためにタイムスタンプ付与
                    const timestamp = new Date().getTime();
                    const response = await fetch(`${API_ENDPOINT}/data?userId=${USER_ID}&_t=${timestamp}`, {
                        cache: "no-store",
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        }
                    });
                    const data = await response.json();

                    // タイムスタンプを数値 (Epoch MS) に変換して統一管理
                    const serverTimeStr = data.timestamp;
                    const serverTimeEpoch = serverTimeStr ? new Date(serverTimeStr).getTime() : 0;

                    // 初回ポール時の同期処理
                    if (isFirstPoll) {
                        if (serverTimeEpoch > 0) {
                            lastProcessedTimestamp = serverTimeEpoch;
                            summonTimestamp = serverTimeEpoch; // Session baseline
                            console.log('Synced baseline ts:', lastProcessedTimestamp);
                        } else {
                            lastProcessedTimestamp = new Date().getTime();
                            summonTimestamp = lastProcessedTimestamp;
                            console.log('No data, set local baseline:', lastProcessedTimestamp);
                        }
                        isFirstPoll = false;
                        return; // 初回は同期のみで終了（反応しない）
                    }

                    // タイムスタンプ比較 (全て数値)
                    if (serverTimeEpoch > lastProcessedTimestamp) {
                        console.log(`New data! ${serverTimeEpoch} > ${lastProcessedTimestamp}`);
                        lastProcessedTimestamp = serverTimeEpoch;

                        if (data.has_change === false) {
                            return;
                        }

                        if (typeof data.is_valid !== 'undefined') {
                            if (data.is_valid) {
                                showModel('happy');
                                // 連続成功チェック
                                await checkConsecutiveSuccess(serverTimeEpoch);
                            } else {
                                showModel('angry');
                                // 連続失敗チェック (進化時のみ)
                                await checkConsecutiveFailure(serverTimeEpoch);
                            }
                        } else if (data.emotion) {
                            showModel(data.emotion);
                        }

                        if (data.message) {
                            showMessage(data.message);
                        }
                    }
                } catch (error) {
                    console.error('データの取得エラー:', error);
                }
            }

            // --- 連続成功チェック関数 ---
            async function checkConsecutiveSuccess(currentTimestamp) {
                if (currentEvolutionStage >= 2) return; // 最終進化済みならこれ以上進化しない

                try {
                    // 最新2件を取得（キャッシュ回避）
                    const timestamp = new Date().getTime();
                    const response = await fetch(`${API_ENDPOINT}/data?userId=${USER_ID}&limit=2&_t=${timestamp}`, {
                        cache: "no-store",
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        }
                    });
                    const data = await response.json();

                    // レスポンスが配列か、Itemsを持つか、単一オブジェクトかを確認
                    let records = [];
                    if (Array.isArray(data)) {
                        records = data;
                    } else if (data.Items) {
                        records = data.Items;
                    } else {
                        records = [data];
                    }

                    if (records.length >= 2) {
                        const latest = records[0];
                        const previous = records[1];

                        // タイムスタンプをEpoch MSに変換して比較
                        const latestTs = new Date(latest.timestamp).getTime();
                        const previousTs = new Date(previous.timestamp).getTime();

                        const isLatestNew = latestTs > summonTimestamp && latestTs > lastStageChangeTimestamp;
                        const isPreviousNew = previousTs > summonTimestamp && previousTs > lastStageChangeTimestamp;

                        if (latest.is_valid === true && previous.is_valid === true) {
                            if (isLatestNew && isPreviousNew) {
                                console.log('Continuous Success! Triggering Evolution.');
                                triggerModelChange();
                            }
                        }
                    }
                } catch (error) {
                    console.error('連続成功チェックエラー:', error);
                }
            }

            // --- 連続失敗チェック関数 (進化後 -> 退化) ---
            async function checkConsecutiveFailure(currentTimestamp) {
                if (currentEvolutionStage <= 0) return; // 初期段階なら何もしない

                try {
                    const timestamp = new Date().getTime();
                    const response = await fetch(`${API_ENDPOINT}/data?userId=${USER_ID}&limit=2&_t=${timestamp}`, {
                        cache: "no-store",
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        }
                    });
                    const data = await response.json();

                    let records = [];
                    if (Array.isArray(data)) {
                        records = data;
                    } else if (data.Items) {
                        records = data.Items;
                    } else {
                        records = [data];
                    }

                    if (records.length >= 2) {
                        const latest = records[0];
                        const previous = records[1];

                        // タイムスタンプをEpoch MSに変換して比較
                        const latestTs = new Date(latest.timestamp).getTime();
                        const previousTs = new Date(previous.timestamp).getTime();

                        const isLatestNew = latestTs > summonTimestamp && latestTs > lastStageChangeTimestamp;
                        const isPreviousNew = previousTs > summonTimestamp && previousTs > lastStageChangeTimestamp;

                        // 両方とも is_valid = false かつセッション内データ
                        if (latest.is_valid === false && previous.is_valid === false) {
                            if (isLatestNew && isPreviousNew) {
                                console.log('Continuous Failure! Triggering Devolution.');

                                // 怒りモーションを見せるために少し待機してから戻す
                                setTimeout(() => {
                                    triggerDevolution();
                                }, 4000); // 4秒後
                            }
                        }
                    }
                } catch (error) {
                    console.error('連続失敗チェックエラー:', error);
                }
            }

            // --- 退化（Devolution）関数 ---
            function triggerDevolution() {
                if (currentEvolutionStage <= 0) return;

                // 1. エフェクト開始
                const modelContainer = document.getElementById('model-container');
                if (modelContainer) {
                    createFlashEffect(modelContainer);
                    createSparkleEffect(modelContainer);
                }

                // 2. フラッシュに合わせてモデル切り替え (0.5秒後)
                setTimeout(() => {
                    currentEvolutionStage--; // ステージ降格
                    lastStageChangeTimestamp = new Date().getTime(); // Update timestamp
                    console.log(`--- DEVOLUTION TRIGGERED --- New Stage: ${currentEvolutionStage}`);

                    hideAllModels();

                    // 新しいステージの待機状態を表示
                    showJoyful();
                    showMessage('残念... 退化してしまった...');
                }, 500);
            }

            // --- 進化演出エフェクト (Flash) ---
            function createFlashEffect(parent) {
                const flash = document.createElement('a-entity');
                flash.setAttribute('geometry', 'primitive: sphere; radius: 0.5');
                flash.setAttribute('material', 'color: #FFFFFF; shader: flat; transparent: true; opacity: 1.0; blending: additive');
                flash.setAttribute('position', '0 1 0'); // Center
                flash.setAttribute('scale', '0.1 0.1 0.1');

                // Scale up and fade out animation
                flash.setAttribute('animation__scale', 'property: scale; to: 15 15 15; dur: 3000; easing: easeOutQuad');
                flash.setAttribute('animation__fade', 'property: material.opacity; from: 1.0; to: 0; dur: 3000; easing: easeOutQuad');

                parent.appendChild(flash);

                // Remove after animation
                setTimeout(() => {
                    if (flash.parentNode) flash.parentNode.removeChild(flash);
                }, 3100);
            }

            // --- キラキラエフェクト (Sparkle) ---
            function createSparkleEffect(parent) {
                const particleCount = 30;
                for (let i = 0; i < particleCount; i++) {
                    const particle = document.createElement('a-entity');
                    // Simple geometry for sparkles
                    particle.setAttribute('geometry', 'primitive: box; width: 0.05; height: 0.05; depth: 0.05');
                    particle.setAttribute('material', 'color: #FFFF00; shader: flat; transparent: true; opacity: 1; blending: additive');
                    particle.setAttribute('position', '0 1 0');

                    // Random direction
                    const dirX = (Math.random() - 0.5) * 12;
                    const dirY = (Math.random() - 0.5) * 12 + 1;
                    const dirZ = (Math.random() - 0.5) * 12;

                    // Animations
                    particle.setAttribute('animation__move', `property: position; to: ${dirX} ${dirY} ${dirZ}; dur: 2500; easing: easeOutExpo`);
                    particle.setAttribute('animation__fade', 'property: material.opacity; from: 1; to: 0; dur: 2500; easing: easeInQuad');
                    particle.setAttribute('animation__spin', `property: rotation; to: ${Math.random() * 720} ${Math.random() * 720} 0; dur: 2500`);

                    parent.appendChild(particle);

                    // Cleanup
                    setTimeout(() => {
                        if (particle.parentNode) particle.parentNode.removeChild(particle);
                    }, 2600);
                }
            }

            // --- モデルチェンジ関数 ---
            function triggerModelChange() {
                if (!isSummoned) return;
                if (currentEvolutionStage >= 2) return;

                currentEvolutionStage++; // ステージ昇格
                lastStageChangeTimestamp = new Date().getTime(); // Update timestamp
                console.log(`--- EVOLUTION TRIGGERED --- New Stage: ${currentEvolutionStage}`);

                // 1. Happyエモーションを少し見せるために遅延させる (2.5秒待機)
                setTimeout(() => {
                    // WBFマーカーのmodel-containerを取得
                    const modelContainer = document.getElementById('model-container');

                    // 2. フラッシュ & キラキラエフェクト開始
                    if (modelContainer) {
                        createFlashEffect(modelContainer);
                        createSparkleEffect(modelContainer);
                    }

                    // 3. フラッシュで画面が白くなったタイミングでモデルを切り替える (さらに0.5秒後)
                    setTimeout(() => {
                        // Happy/Angryモデルを非表示
                        hideAllModels();

                        // 新しいステージのモデルを表示
                        showJoyful();

                        // メッセージ更新
                        if (currentEvolutionStage === 1) {
                            showMessage('すごい！2回連続成功や！リサイクルバディに進化したで！');
                        } else if (currentEvolutionStage === 2) {
                            showMessage('うおおお！さらに進化したで！スーパーバディや！');
                        }

                        // お祝いエフェクト（アイコン）
                        showEmotionIcons('celebrate');


                    }, 500); // フラッシュ開始から0.5秒後にモデル切り替え

                }, 2500); // Happyアニメーションを2.5秒見せる
            }

            // 2秒ごとにチェック (Performance: Reduced from 1s)
            setInterval(checkEmotionData, 2000);
            console.log('App Initialized. Polling started.');
        });
    } else {
        console.error("a-scene not found!");
    }
});

// ==========================================
// 音声処理関数群
// ==========================================
async function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(stream);
        // Buffer size reduced to 1024 to minimize latency (approx 42ms at 24kHz)
        const processor = audioContext.createScriptProcessor(1024, 1, 1);

        source.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = (e) => {
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = floatTo16BitPCM(inputData);
            const base64Audio = arrayBufferToBase64(pcmData);
            socket.send(JSON.stringify({
                type: "input_audio_buffer.append",
                audio: base64Audio
            }));
        };
    } catch (err) {
        console.error("マイク許可エラー:", err);
        alert("マイクの使用を許可してください");
    }
}

function connectWebSocket() {
    const url = `${SERVER_URL}?role=ar&token=${TOKEN}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
        document.getElementById('status').innerText = "接続中 (role=ar)";
        console.log("Connected to Server");
    };

    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "response.audio.delta") {
            playAudio(data.delta);
        }
    };

    socket.onclose = () => {
        document.getElementById('status').innerText = "切断されました";
    };
}

function playAudio(base64Data) {
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const int16Data = new Int16Array(bytes.buffer);
    const floatData = new Float32Array(int16Data.length);

    for (let i = 0; i < int16Data.length; i++) {
        floatData[i] = int16Data[i] / 32768.0;
    }

    const buffer = audioContext.createBuffer(1, floatData.length, 24000);
    buffer.getChannelData(0).set(floatData);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const currentTime = audioContext.currentTime;
    if (nextStartTime < currentTime) {
        nextStartTime = currentTime;
    }
    source.start(nextStartTime);
    nextStartTime += buffer.duration;
}

function floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        let s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output.buffer;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// --- Debug Component: Log Animations ---
AFRAME.registerComponent('model-logger', {
    init: function () {
        // console.log(`[Model Logger] Initialized for ${this.el.id}`);
        // Reduced excessive logging
        this.el.addEventListener('model-loaded', (e) => {
            const model = this.el.getObject3D('mesh');
            if (model && model.animations && model.animations.length > 0) {
                // console.log(`[Model Logger] Animations for ${this.el.id}: ${JSON.stringify(model.animations.map(a => a.name))}`);
            }
        });

        this.el.addEventListener('model-error', (e) => {
            console.error(`[Model Logger] Error loading model ${this.el.id}:`, e.detail);
        });
    }
});
