const express = require('express');
const fs = require('fs');
const path = require('path');
const XlsxPopulate = require('xlsx-populate');

const router = express.Router();

// 匯出分析需求單 API (使用 xlsx-populate)
router.get('/:orderId/export-analysis', async (req, res) => {
    try {
        const { orderId } = req.params;
        // 注意：這裡假設路由被掛載在 /api/orders 下，所以 __dirname 需要往上兩層找到 orders
        // 但為了保險，我們使用絕對路徑或相對於專案根目錄的路徑
        // 假設此檔案在 tgia-backend/routes/ 下
        const backendDir = path.join(__dirname, '..');
        const ordersDir = path.join(backendDir, 'orders');
        const templatesDir = path.join(backendDir, 'templates');
        const orderFile = path.join(ordersDir, `${orderId}.json`);

        if (!fs.existsSync(orderFile)) {
            return res.status(404).json({ error: '訂單不存在' });
        }

        const orderData = JSON.parse(fs.readFileSync(orderFile, 'utf-8'));
        const templatePath = path.join(templatesDir, 'TGIA分析需求單_v.20251201.xlsx');

        if (!fs.existsSync(templatePath)) {
            return res.status(500).json({ error: '分析需求單模板不存在' });
        }

        // 使用 xlsx-populate 讀取模板
        const workbook = await XlsxPopulate.fromFileAsync(templatePath);
        const sheet = workbook.sheet('RNA-seq');

        if (!sheet) {
            return res.status(500).json({ error: '模板中找不到 "RNA-seq" 工作表' });
        }

        // 1. 基本資料填寫
        if (orderData.salesPerson) sheet.cell('D5').value(orderData.salesPerson);
        if (orderData.organization) sheet.cell('B7').value(orderData.organization);
        if (orderData.principalInvestigator) sheet.cell('D7').value(orderData.principalInvestigator);
        if (orderData.contactPerson) sheet.cell('F7').value(orderData.contactPerson);
        if (orderData.contactPhone) sheet.cell('H7').value(orderData.contactPhone);
        if (orderData.email) sheet.cell('J7').value(orderData.email);

        // 2. 服務項目勾選 (A204-A207)
        if (orderData.serviceItems) {
            orderData.serviceItems.forEach(item => {
                if (item.category === '分析服務 (A)' && item.services) {
                    item.services.forEach(s => {
                        if (s.service) {
                            if (s.service.startsWith('A204')) sheet.cell('A11').value('v');
                            if (s.service.startsWith('A205')) sheet.cell('A12').value('v');
                            if (s.service.startsWith('A206')) sheet.cell('A13').value('v');
                            if (s.service.startsWith('A207')) sheet.cell('A14').value('v');
                        }
                    });
                }
            });
        }

        // 3. 樣本表填寫 (Row 17-116)
        if (orderData.analysisRequirements && orderData.analysisRequirements.sampleSheet) {
            orderData.analysisRequirements.sampleSheet.forEach((row, index) => {
                if (index < 100) { // 最多 100 行 (17-116)
                    const currentRow = 17 + index;
                    if (row.sampleName) sheet.cell(`B${currentRow}`).value(row.sampleName);
                    if (row.group1) sheet.cell(`C${currentRow}`).value(row.group1);
                    if (row.group2) sheet.cell(`D${currentRow}`).value(row.group2);
                    if (row.group3) sheet.cell(`E${currentRow}`).value(row.group3);
                    if (row.source) sheet.cell(`F${currentRow}`).value(row.source);
                }
            });
        }

        // 4. 差異表達分析參數
        if (orderData.analysisRequirements && orderData.analysisRequirements.deParams) {
            const { logFC, pMethod, pCutoff } = orderData.analysisRequirements.deParams;
            if (logFC) sheet.cell('F119').value(parseFloat(logFC));
            if (pMethod) sheet.cell('E120').value(pMethod);
            if (pCutoff) sheet.cell('F120').value(parseFloat(pCutoff));
        }

        // 5. 物種勾選 (B119-B130) + 其他 (Row 131)
        if (orderData.species) {
            if (orderData.species === '其他') {
                sheet.cell('A131').value('v');
                if (orderData.speciesOther) sheet.cell('B131').value(orderData.speciesOther);
                if (orderData.speciesOtherScientificName) sheet.cell('C131').value(orderData.speciesOtherScientificName);
                if (orderData.speciesOtherReferenceGenome) sheet.cell('D131').value(orderData.speciesOtherReferenceGenome);
            } else {
                const targetSpecies = orderData.species.trim().toLowerCase();
                for (let r = 119; r <= 130; r++) {
                    const cell = sheet.cell(`B${r}`);
                    const cellValue = cell.value();

                    if (cellValue && typeof cellValue === 'string') {
                        if (cellValue.toLowerCase().includes(targetSpecies) || targetSpecies.includes(cellValue.toLowerCase())) {
                            sheet.cell(`A${r}`).value('v');
                            break;
                        }
                    }
                }
            }
        }

        // 6. 客製化需求 (H11)
        if (orderData.analysisRequirements && orderData.analysisRequirements.customRequirements) {
            sheet.cell('H11').value(orderData.analysisRequirements.customRequirements);
        }

        // 7. 差異表達分析比較組 (Row 135+)
        if (orderData.analysisRequirements && orderData.analysisRequirements.comparisonGroups) {
            orderData.analysisRequirements.comparisonGroups.forEach((group, index) => {
                const currentRow = 135 + index;
                // 填寫比較組資料
                if (group.group1Control) sheet.cell(`B${currentRow}`).value(group.group1Control);
                if (group.group1Treatment) sheet.cell(`C${currentRow}`).value(group.group1Treatment);

                if (group.group2Control) sheet.cell(`D${currentRow}`).value(group.group2Control);
                if (group.group2Treatment) sheet.cell(`E${currentRow}`).value(group.group2Treatment);

                if (group.group3Control) sheet.cell(`F${currentRow}`).value(group.group3Control);
                if (group.group3Treatment) sheet.cell(`G${currentRow}`).value(group.group3Treatment);
            });
        }

        // 輸出檔案
        const buffer = await workbook.outputAsync();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=TGIA_Analysis_Request_${orderId}.xlsx`);
        res.send(buffer);

        console.log(`📥 分析需求單已匯出 (xlsx-populate): ${orderId}`);

    } catch (error) {
        console.error('❌ 匯出分析需求單失敗:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
