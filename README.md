# TGIA Order System

這是一個無資料庫 (Database-less) 的訂單管理系統，專為 TGIA 設計。它允許使用者填寫訂單，將資料儲存為 JSON 檔案，並自動生成格式化的 Excel 報表。

## 系統架構 (System Architecture)

本系統採用前後端分離架構，但為了簡化部署與維護，不使用傳統資料庫 (如 MySQL, MongoDB)，而是採用 **檔案系統 (File System)** 作為資料儲存媒介。

```mermaid
graph TD
    User["使用者 (User)"] -->|填寫表單| Frontend["React 前端 (Frontend)"]
    Frontend -->|POST /api/orders (JSON)| Backend["Node.js 後端 (Backend)"]
    
    subgraph "Server Side (Backend)"
        Backend -->|Save JSON| FS["檔案系統 (File System)"]
        FS -->|Read JSON| Backend
        Backend -->|Read Template| Template["Excel 模板 (templates/order_template.xlsx)"]
        Backend -->|Generate Excel| ExcelGen["Excel 產生器 (ExcelJS)"]
    end
    
    Backend -->|Return orderId| Frontend
    Frontend -->|GET /api/orders/:id/export| Backend
    Backend -->|Download Excel| User
    
    FS -.->|Stores| OrdersDir["orders/TGIA-{timestamp}.json"]
```

### 核心流程
1. **填寫訂單**: 使用者在前端填寫訂單資訊。
2. **資料儲存**: 前端將資料發送至後端，後端將其儲存為 JSON 檔案 (位於 `tgia-backend/orders/`)。
3. **報表生成**: 當需要匯出時，後端讀取對應的 JSON 檔案，並根據 `templates/order_template.xlsx` 模板，將資料填入並保留原始格式 (如邊框、字體)。
4. **檔案下載**: 生成的 Excel 檔案直接回傳給前端供使用者下載。

## 專案結構 (Project Structure)

```
tgia-order-system/
├── src/                  # React 前端原始碼
│   ├── App.js            # 主要應用程式邏輯
│   ├── index.css         # 全域樣式 (Tailwind CSS)
│   └── ...               # 其他組件與靜態資源 (JSON data)
├── tgia-backend/         # Node.js 後端
│   ├── server.js         # 伺服器入口點 (Express)
│   ├── orders/           # [自動生成] 儲存訂單 JSON 檔案
│   └── templates/        # Excel 模板存放處
│       └── order_template.xlsx
├── package.json          # 前端依賴設定
└── ...
```

## 安裝與執行 (Installation & Usage)

本專案包含前端與後端，建議分別開啟兩個終端機視窗來執行。

### 1. 啟動後端 (Backend)

```bash
cd tgia-backend
npm install
npm start
```
後端預設運行於 `http://localhost:3001`。

### 2. 啟動前端 (Frontend)

```bash
# 回到根目錄
cd .. 
npm install
npm start
```
前端預設運行於 `http://localhost:3000`。

## 技術堆疊 (Tech Stack)

- **Frontend**: React, Tailwind CSS
- **Backend**: Node.js, Express
- **Data Storage**: JSON Files (Local File System)
- **Excel Processing**: ExcelJS

## 注意事項

- **資料備份**: 所有的訂單資料都儲存在 `tgia-backend/orders/` 目錄下，請定期備份此目錄。
- **模板修改**: 若需修改 Excel 輸出格式，請直接編輯 `tgia-backend/templates/order_template.xlsx`，但請確保欄位對應邏輯 (server.js) 同步更新。
