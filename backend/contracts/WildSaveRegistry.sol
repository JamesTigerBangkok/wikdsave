// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, euint64, euint8, eaddress, ebool, externalEuint32, externalEuint64, externalEuint8, externalEaddress, externalEbool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * WildSave – 野生动物救助链上登记（FHEVM 版本）
 * 设计要点：
 * - 公开展示字段（动物名、位置、IPFS哈希等）使用明文存储
 * - 统计字段（如贡献计数）使用 FHE 加密整数存储，避免直接可见并支持同态加减
 * - NFT 与记录一一对应：tokenId == rescueId
 */
contract WildSaveRegistry is SepoliaConfig, ERC721, Ownable, ReentrancyGuard {
    using Strings for uint256;

    struct RescueData {
        string animal;       // 物种名（明文展示）
        string location;     // 地点（人类可读）
        string description;  // 描述（建议存摘要）
        string imageHash;    // IPFS CID
        address rescuer;     // 发起者
        uint256 timestamp;   // 上链时间
        int32 latitude;      // 可选：纬度 * 1e6（避免浮点）
        int32 longitude;     // 可选：经度 * 1e6
    }

    event RescueAdded(uint256 indexed rescueId, address indexed rescuer, string animal, string location, string imageHash, uint256 timestamp);

    // 记录存储（明文元数据）
    RescueData[] private _rescues;

    // 贡献计数（加密 euint32），按需授权用户解密
    mapping(address => euint32) private _rescueCountEnc;

    // 最近一次救助时间（加密 euint64）
    mapping(address => euint64) private _lastRescueTsEnc;

    // 用户徽章随机种子（加密 euint32）
    mapping(address => euint32) private _userBadgeSeedEnc;
    mapping(address => bool) private _userBadgeSeedInit;

    // 平台累计总数（加密 euint32），与明文 totalRescues 并存
    euint32 private _totalEnc;

    // 可公开的累计总数（明文，便于前端展示与分页）
    uint256 public totalRescues;

    // 可选：基础 tokenURI 前缀（指向 IPFS 元数据）
    string public baseTokenURI;

    // 用户已领取的身份（0: none, 1: beginner, 2: intermediate, 3: expert）
    mapping(address => uint8) public claimedTier;

    constructor(string memory baseURI_) ERC721("WildSave", "WILD") Ownable(msg.sender) {
        baseTokenURI = baseURI_;
        // 初始化加密累计为 0（trivial encryption）
        _totalEnc = FHE.asEuint32(0);
    }

    function setBaseTokenURI(string calldata baseURI_) external onlyOwner {
        baseTokenURI = baseURI_;
    }

    // ================ 写入 ================
    function addRescue(
        string calldata animal,
        string calldata location,
        string calldata description,
        string calldata imageHash,
        int32 latitude,
        int32 longitude,
        externalEuint32 one, // 传入外部密文常量1，用于同态自增
        bytes calldata proof
    ) external nonReentrant returns (uint256 rescueId) {
        require(bytes(animal).length > 0, "animal required");
        require(bytes(location).length > 0, "location required");
        require(bytes(imageHash).length > 0, "image required");

        rescueId = _rescues.length;

        _rescues.push(RescueData({
            animal: animal,
            location: location,
            description: description,
            imageHash: imageHash,
            rescuer: msg.sender,
            timestamp: block.timestamp,
            latitude: latitude,
            longitude: longitude
        }));

        // 贡献计数同态自增：count = count + 1
        euint32 current = _rescueCountEnc[msg.sender];
        euint32 inc = FHE.fromExternal(one, proof); // 外部密文 → 内部 euint32
        euint32 nextCount = FHE.add(current, inc);
        _rescueCountEnc[msg.sender] = nextCount;

        // 授权本合约与用户对计数解密访问（便于后续统计或用户查看）
        FHE.allowThis(nextCount);
        FHE.allow(nextCount, msg.sender);

        // 更新最近一次救助时间（加密存储）
        euint64 tsEnc = FHE.asEuint64(uint64(block.timestamp));
        _lastRescueTsEnc[msg.sender] = tsEnc;
        FHE.allowThis(tsEnc);
        FHE.allow(tsEnc, msg.sender);

        // 初始化用户徽章随机种子（一次性）
        if (!_userBadgeSeedInit[msg.sender]) {
            euint32 seed = FHE.randEuint32();
            _userBadgeSeedEnc[msg.sender] = seed;
            _userBadgeSeedInit[msg.sender] = true;
            FHE.allowThis(seed);
            FHE.allow(seed, msg.sender);
        }

        // 平台累计总数（加密）自增 1（标量运算更省 gas）
        _totalEnc = FHE.add(_totalEnc, 1);
        FHE.allowThis(_totalEnc);

        // 铸造对应 NFT：tokenId == rescueId
        _safeMint(msg.sender, rescueId);

        totalRescues += 1;

        emit RescueAdded(rescueId, msg.sender, animal, location, imageHash, block.timestamp);
    }

    // ================ 读取 ================
    function getRescue(uint256 id) external view returns (RescueData memory) {
        require(id < _rescues.length, "invalid id");
        return _rescues[id];
    }

    function getTotalRescues() external view returns (uint256) {
        return totalRescues;
    }

    // 加密累计总数句柄（用于离链解密）
    function getEncryptedTotal() external view returns (euint32) {
        return _totalEnc;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "ERC721: invalid tokenId");
        if (bytes(baseTokenURI).length == 0) return "";
        return string(abi.encodePacked(baseTokenURI, tokenId.toString()));
    }

    // 用户私密查看：返回其加密计数（句柄），供前端 userDecrypt 使用
    function getRescueCountHandle(address user) external view returns (euint32) {
        return _rescueCountEnc[user];
    }

    // 最近一次救助时间（加密）句柄
    function getLastRescueTimestampHandle(address user) external view returns (euint64) {
        return _lastRescueTsEnc[user];
    }

    // 用户徽章随机种子（加密）句柄
    function getUserBadgeSeedHandle(address user) external view returns (euint32) {
        return _userBadgeSeedEnc[user];
    }

    // 授权他人查看我的贡献计数（持久）
    function grantMyCountAccess(address who) external {
        euint32 v = _rescueCountEnc[msg.sender];
        FHE.allow(v, who);
    }

    // 授权他人查看我的贡献计数（仅当前交易瞬时）
    function grantMyCountAccessTransient(address who) external {
        euint32 v = _rescueCountEnc[msg.sender];
        FHE.allowTransient(v, who);
    }

    // 加密比较：我是否达到阈值（返回 ebool，可由调用者解密）
    function isContributorAtLeast(uint32 threshold) external returns (ebool) {
        euint32 v = _rescueCountEnc[msg.sender];
        ebool geq = FHE.ge(v, FHE.asEuint32(threshold));
        FHE.allow(geq, msg.sender);
        return geq;
    }

    // 加密段位：根据阈值返回 0/1/2 段位（euint8），不泄露明文
    function contributorTier(uint32 tier1, uint32 tier2) external returns (euint8) {
        euint32 v = _rescueCountEnc[msg.sender];
        ebool ge1 = FHE.ge(v, FHE.asEuint32(tier1));
        ebool ge2 = FHE.ge(v, FHE.asEuint32(tier2));
        euint8 t1 = FHE.select(ge1, FHE.asEuint8(1), FHE.asEuint8(0));
        euint8 t2 = FHE.select(ge2, FHE.asEuint8(2), t1);
        FHE.allow(t2, msg.sender);
        return t2;
    }

    // ================ 帮助函数（分页/用户列表） ================
    function getRescuesByUser(address user) external view returns (uint256[] memory ids) {
        uint256 n = _rescues.length;
        uint256 count;
        for (uint256 i = 0; i < n; i++) {
            if (_rescues[i].rescuer == user) count++;
        }
        ids = new uint256[](count);
        uint256 idx;
        for (uint256 i = 0; i < n; i++) {
            if (_rescues[i].rescuer == user) ids[idx++] = i;
        }
    }

    /// @notice 领取身份（0:无,1:beginner,2:intermediate,3:expert）。只升不降（演示用，基于已公开的计数）
    function claimIdentity(uint8 tier) external {
        require(tier >= 1 && tier <= 3, "invalid tier");

        // 演示：把密文路径替换为明文路径，避免依赖库未开放接口
        uint256 clear = _getPlainRescueCount(msg.sender);
        if (tier == 1) {
            require(clear >= 1, "not eligible");
        } else if (tier == 2) {
            require(clear >= 5, "not eligible");
        } else if (tier == 3) {
            require(clear >= 20, "not eligible");
        }

        require(tier > claimedTier[msg.sender], "already claimed same/higher");
        claimedTier[msg.sender] = tier;
    }

    function _getPlainRescueCount(address user) internal view returns (uint256 cnt) {
        uint256 n = _rescues.length;
        for (uint256 i = 0; i < n; i++) {
            if (_rescues[i].rescuer == user) cnt++;
        }
    }
}


