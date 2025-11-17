 const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3001;


// ✅ CORS 配置（允許 Render 前端）
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://tgia-order.onrender.com/'  // 前端 URL
  ],
  credentials: true
}));

app.use(bodyParser.json({ limit: '50mb' }));

app.use(bodyParser.json({ limit: '50mb' }));

const ordersDir = path.join(__dirname, 'orders');  // 使用當前目錄
const templatesDir = path.join(__dirname, 'templates');

if (!fs.existsSync(ordersDir)) {
  fs.mkdirSync(ordersDir, { recursive: true });
}



// ⭐⭐⭐ 新增：複製行格式的輔助函數 ⭐⭐⭐
function copyRowStyle(worksheet, sourceRow, targetRow, startCol, endCol) {
  for (let col = startCol; col <= endCol; col++) {
    const sourceCell = worksheet.getRow(sourceRow).getCell(col);
    const targetCell = worksheet.getRow(targetRow).getCell(col);
    
    // 複製樣式（邊框、字體、對齊、填充等）
    if (sourceCell.style) {
      targetCell.style = {
        font: sourceCell.font ? { ...sourceCell.font } : undefined,
        alignment: sourceCell.alignment ? { ...sourceCell.alignment } : undefined,
        border: sourceCell.border ? {
          top: sourceCell.border.top ? { ...sourceCell.border.top } : undefined,
          left: sourceCell.border.left ? { ...sourceCell.border.left } : undefined,
          bottom: sourceCell.border.bottom ? { ...sourceCell.border.bottom } : undefined,
          right: sourceCell.border.right ? { ...sourceCell.border.right } : undefined
        } : undefined,
        fill: sourceCell.fill ? { ...sourceCell.fill } : undefined,
        numFmt: sourceCell.numFmt
      };
    }
    
    // 複製列高
    const sourceRowObj = worksheet.getRow(sourceRow);
    const targetRowObj = worksheet.getRow(targetRow);
    if (sourceRowObj.height) {
      targetRowObj.height = sourceRowObj.height;
    }
  }
}

// 插入新列並複製樣式
function insertRowWithStyle(worksheet, templateRow, targetRow, startCol, endCol) {
  // 1) 先插入一列（空的）
  worksheet.insertRow(targetRow, []);

  // 2) 再把模板列的樣式複製過去
  copyRowStyle(worksheet, templateRow, targetRow, startCol, endCol);
}


app.post('/api/orders', (req, res) => {
  try {
    const formData = req.body;
    const orderId = `TGIA-${Date.now()}`;
    const orderFile = path.join(ordersDir, `${orderId}.json`);
    
    fs.writeFileSync(orderFile, JSON.stringify(formData, null, 2));
    
    console.log(`✅ 訂單已保存: ${orderId}`);
    res.json({ success: true, orderId });
  } catch (error) {
    console.error('❌ 保存訂單失敗:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/orders/:orderId/export', async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderFile = path.join(ordersDir, `${orderId}.json`);
    
    if (!fs.existsSync(orderFile)) {
      return res.status(404).json({ error: '訂單不存在' });
    }
    
    const orderData = JSON.parse(fs.readFileSync(orderFile, 'utf-8'));
    
    const templatePath = path.join(templatesDir, 'order_template.xlsx');
    
    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ error: '模板檔案不存在' });
    }
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    
    // 清除具名範圍
    try {
      if (workbook.definedNames) {
        workbook.definedNames.removeAllNames();
      }
    } catch (e) {
      console.log('⚠️ 無具名範圍需要清除');
    }
    
    // ============ 填入「訂購單」工作表 ============
    const sheet1 = workbook.getWorksheet('訂購單');
    
    if (orderData.customerPO) sheet1.getCell('B4').value = orderData.customerPO;
    if (orderData.salesPerson) sheet1.getCell('E4').value = orderData.salesPerson;
    sheet1.getCell('B5').value = orderId;
    sheet1.getCell('E5').value = new Date().toLocaleDateString('zh-TW');
    
    if (orderData.organization) sheet1.getCell('B7').value = orderData.organization;
    if (orderData.principalInvestigator) sheet1.getCell('D7').value = orderData.principalInvestigator;
    if (orderData.contactPerson) sheet1.getCell('G7').value = orderData.contactPerson;
    if (orderData.contactPhone) sheet1.getCell('I7').value = orderData.contactPhone;
    if (orderData.address) sheet1.getCell('B8').value = orderData.address;
    if (orderData.email) sheet1.getCell('G8').value = orderData.email;
    
    if (orderData.invoiceTitle) sheet1.getCell('C9').value = orderData.invoiceTitle;
    if (orderData.taxId) sheet1.getCell('C10').value = orderData.taxId;
    if (orderData.invoiceCopies) sheet1.getCell('C11').value = orderData.invoiceCopies;
    
    if (orderData.dataDeliveryMethod) sheet1.getCell('C12').value = orderData.dataDeliveryMethod;
    if (orderData.nchcAccount) sheet1.getCell('C13').value = orderData.nchcAccount;
    if (orderData.deliveryAddress) sheet1.getCell('C14').value = orderData.deliveryAddress;
    if (orderData.recipient) sheet1.getCell('C15').value = orderData.recipient;
    if (orderData.recipientPhone) sheet1.getCell('C16').value = orderData.recipientPhone;
    if (orderData.recipientEmail) sheet1.getCell('C17').value = orderData.recipientEmail;
    
    sheet1.getCell('I1').value = orderData.isUrgent ? '急件' : '正常單';
    
    // ⭐⭐⭐ 服務品項（修正版：自動複製格式）⭐⭐⭐
    // ⭐⭐⭐ 服務品項（修正版：加入序號）⭐⭐s⭐
    const serviceTemplateRow = 22;
    let currentRow = serviceTemplateRow;
    let serviceIndex = 1;

    orderData.serviceItems.forEach((item) => {
      item.services.forEach((service) => {
        if (service.service) {
          if (serviceIndex === 1) {
            // 第一筆：直接用模板列
            // 不插入，只填值
          } else {
            // 之後的每一筆：在 currentRow 下插入新列 + 複製樣式
            const targetRow = currentRow + 1;
            insertRowWithStyle(sheet1, serviceTemplateRow, targetRow, 1, 3);
            currentRow = targetRow;
          }

          sheet1.getCell(`A${currentRow}`).value = serviceIndex;
          sheet1.getCell(`B${currentRow}`).value = service.service;
          sheet1.getCell(`C${currentRow}`).value = parseInt(service.quantity) || 0;

          serviceIndex++;
        }
      });
    }); // 👈 這邊一定要有

    console.log(`✅ 服務品項已寫入 ${serviceIndex - 1} 行`);
    const serviceRows = serviceIndex - 1;              // 真實服務筆數
    const extraRows = serviceRows > 0 ? serviceRows - 1 : 0;  // 多插入的列數  

    const rowSampleType     = 29 + extraRows;  // 樣本類型 / 保存方式
    const rowSampleCount    = 31 + extraRows;  // 樣本數 / 物種
    const rowSampleReturn   = 33 + extraRows;  // 是否退樣 / 運送方式
    const rowNotes          = 34 + extraRows;  // 備註    

    let sampleTypeValue = orderData.sampleType || '';
    if (sampleTypeValue === '其他' && orderData.sampleTypeOther) {
      sampleTypeValue = orderData.sampleTypeOther;
    }
    if (sampleTypeValue) sheet1.getCell(`B${rowSampleType}`).value = sampleTypeValue;

    let preservationValue = orderData.preservationMethod || '';
    if (preservationValue === '其他' && orderData.preservationMethodOther) {
      preservationValue = preservationValue.sampleTypeOther;
    }
    if (preservationValue) sheet1.getCell(`F${rowSampleType}`).value = preservationValue;

    if (orderData.sampleCount) {
      sheet1.getCell(`B${rowSampleCount}`).value = parseInt(orderData.sampleCount);
    }

    let speciesValue = orderData.species || '';
    if (speciesValue === '其他' && orderData.speciesOther) {
      speciesValue = orderData.speciesOther;
    }
    if (speciesValue) sheet1.getCell(`D${rowSampleCount}`).value = speciesValue;

    if (orderData.sampleReturn) {
      sheet1.getCell(`B${rowSampleReturn}`).value = orderData.sampleReturn;
    }

    let shippingValue = orderData.shippingMethod || '';
    if (shippingValue === '其他' && orderData.shippingMethodOther) {
      shippingValue = orderData.shippingMethodOther;
    }
    if (shippingValue) sheet1.getCell(`F${rowSampleReturn}`).value = shippingValue;

    if (orderData.notes) {
      sheet1.getCell(`B${rowNotes}`).value = orderData.notes;
    }
    
    // // 簽名插入
    // if (orderData.signature) {
    //   try {
    //     const base64Data = orderData.signature.replace(/^data:image\/\w+;base64,/, '');
    //     const imageBuffer = Buffer.from(base64Data, 'base64');
        
    //     const imageId = workbook.addImage({
    //       buffer: imageBuffer,
    //       extension: 'png',
    //     });
        
    //     sheet1.addImage(imageId, {
    //       tl: { col: 1, row: 36 },
    //       br: { col: 3.5, row: 39 },
    //       editAs: 'oneCell'
    //     });
        
    //     console.log('✅ 簽名圖片已插入');
    //   } catch (imgError) {
    //     console.error('❌ 簽名圖片插入失敗:', imgError);
    //   }
    // }
    
    // ============ 填入對應的樣本工作表 ============
    
    if (orderData.sampleType === 'Library') {
      const sheet3 = workbook.getWorksheet('Library');
      
      if (orderData.customerPO) sheet3.getCell('B4').value = orderData.customerPO;
      if (orderData.salesPerson) sheet3.getCell('E4').value = orderData.salesPerson;
      sheet3.getCell('B5').value = orderId;
      sheet3.getCell('E5').value = new Date().toLocaleDateString('zh-TW');
      if (orderData.organization) sheet3.getCell('B7').value = orderData.organization;
      if (orderData.principalInvestigator) sheet3.getCell('D7').value = orderData.principalInvestigator;
      if (orderData.contactPerson) sheet3.getCell('G7').value = orderData.contactPerson;
      if (orderData.contactPhone) sheet3.getCell('I7').value = orderData.contactPhone;
      
      if (orderData.libraryInfo && orderData.libraryInfo.concMethod) {
        sheet3.getCell('E11').value = orderData.libraryInfo.concMethod;
      }
      
      // ⭐⭐⭐ Library Sample Sheet（第一個表格）⭐⭐⭐
      if (orderData.libraryInfo && orderData.libraryInfo.sampleSheet) {
        const sampleSheetTemplateRow = 12;
        let currentRow = sampleSheetTemplateRow;

        orderData.libraryInfo.sampleSheet.forEach((row, idx) => {
          if (!row.sampleName) return;

          if (idx === 0) {
            // 用模板行
          } else {
            const targetRow = currentRow + 1;
            insertRowWithStyle(sheet3, sampleSheetTemplateRow, targetRow, 1, 9);
            currentRow = targetRow;
          }

          sheet3.getCell(`A${currentRow}`).value = idx + 1;
          sheet3.getCell(`B${currentRow}`).value = row.sampleName;
          if (row.tubeLabel) sheet3.getCell(`C${currentRow}`).value = row.tubeLabel;
          if (row.conc) sheet3.getCell(`E${currentRow}`).value = row.conc;
          if (row.vol) sheet3.getCell(`F${currentRow}`).value = row.vol;
          if (row.ngsConc) sheet3.getCell(`G${currentRow}`).value = row.ngsConc;
          if (row.expectedSeq) sheet3.getCell(`H${currentRow}`).value = row.expectedSeq;
          if (row.note) sheet3.getCell(`I${currentRow}`).value = row.note;
        });

        console.log(`✅ Library Sample Sheet 已寫入 ${orderData.libraryInfo.sampleSheet.length} 行`);
      }
            
      // if (orderData.libraryInfo && orderData.libraryInfo.runConfig) {
      //   const config = orderData.libraryInfo.runConfig;
      //   if (config.sequencer) sheet3.getCell('C24').value = config.sequencer;
      //   if (config.read1Length) sheet3.getCell('C25').value = config.read1Length;
      //   #if (config.read2Length) sheet3.getCell('C26').value = config.read2Length;
      //   #if (config.phiX) sheet3.getCell('C27').value = config.phiX;
      // }
      
      // ⭐⭐⭐ Library Sample Sheet（第二個表格）⭐⭐⭐
      if (orderData.libraryInfo && orderData.libraryInfo.librarySampleSheet) {
        let librarySampleSheetTemplateRow = null;        
        
        sheet3.eachRow((row, rowNumber) => {
          const cellValue = row.getCell(1).value; // A 欄 = column 1
          if (cellValue && cellValue.toString().includes('5. Library Sample Sheet')) {
            librarySampleSheetTemplateRow = rowNumber + 4; // 找到後往下 4 行
            return false; // 找到就停止搜尋
          }
        });
        
        // 如果沒找到，使用預設值 40
        if (!librarySampleSheetTemplateRow) {
          console.warn('⚠️ 未找到 "5. Library Sample Sheet" 標題，使用預設行號 40');
          librarySampleSheetTemplateRow = 40;
        }

        // 🆕 使用插入 + 複製樣式的方式
        let currentRow = librarySampleSheetTemplateRow;

        orderData.libraryInfo.librarySampleSheet.forEach((row, idx) => {
          if (!row.sampleName) return;

          if (idx === 0) {
            // 第一列：用模板本身
          } else {
            const targetRow = currentRow + 1;
            insertRowWithStyle(sheet3, librarySampleSheetTemplateRow, targetRow, 1, 10);
            currentRow = targetRow;
          }
          
          sheet3.getCell(`A${currentRow}`).value = idx + 1;
          sheet3.getCell(`B${currentRow}`).value = row.sampleName;
          if (row.libraryPrepKit) sheet3.getCell(`C${currentRow}`).value = row.libraryPrepKit;
          if (row.indexAdapterKit) sheet3.getCell(`E${currentRow}`).value = row.indexAdapterKit;
          if (row.setWellPosition) sheet3.getCell(`F${currentRow}`).value = row.setWellPosition;
          if (row.index1Seq) sheet3.getCell(`G${currentRow}`).value = row.index1Seq;
          if (row.index2Seq) sheet3.getCell(`H${currentRow}`).value = row.index2Seq;
          if (row.note) sheet3.getCell(`I${currentRow}`).value = row.note;
          if (row.library) sheet3.getCell(`J${currentRow}`).value = row.library;
        });
        
        console.log(`✅ Library Sample Sheet (第二表) 已寫入 ${orderData.libraryInfo.librarySampleSheet.length} 行`);
      }
      
    } else if (orderData.sampleType !== '無送樣') {
      const sheet2 = workbook.getWorksheet('Cell Blood DNA RNA');
      
      if (orderData.customerPO) sheet2.getCell('B4').value = orderData.customerPO;
      if (orderData.salesPerson) sheet2.getCell('E4').value = orderData.salesPerson;
      sheet2.getCell('B5').value = orderId;
      sheet2.getCell('E5').value = new Date().toLocaleDateString('zh-TW');
      if (orderData.organization) sheet2.getCell('B7').value = orderData.organization;
      if (orderData.principalInvestigator) sheet2.getCell('D7').value = orderData.principalInvestigator;
      if (orderData.contactPerson) sheet2.getCell('F7').value = orderData.contactPerson;
      if (orderData.contactPhone) sheet2.getCell('H7').value = orderData.contactPhone;
      
      if (orderData.sampleInfo && orderData.sampleInfo.concMethod) {
        sheet2.getCell('E11').value = orderData.sampleInfo.concMethod;
      }
      
      // ⭐⭐⭐ Sample Sheet（DNA/RNA/Cell/Blood）⭐⭐⭐
      if (orderData.sampleInfo && orderData.sampleInfo.sampleSheet) {
        const sampleSheetTemplateRow = 12;
        let currentRow = sampleSheetTemplateRow;

        orderData.sampleInfo.sampleSheet.forEach((row, idx) => {
          if (!row.sampleName) return;

          if (idx === 0) {
            // 第一列：直接用模板
          } else {
            const targetRow = currentRow + 1;
            insertRowWithStyle(sheet2, sampleSheetTemplateRow, targetRow, 1, 10);
            currentRow = targetRow;
          }

          sheet2.getCell(`A${currentRow}`).value = idx + 1;
          sheet2.getCell(`B${currentRow}`).value = row.sampleName;
          if (row.tubeLabel) sheet2.getCell(`C${currentRow}`).value = row.tubeLabel;
          if (row.expectedSeq) sheet2.getCell(`D${currentRow}`).value = row.expectedSeq;
          if (row.conc) sheet2.getCell(`E${currentRow}`).value = row.conc;
          if (row.vol) sheet2.getCell(`F${currentRow}`).value = row.vol;
          if (row.ratio260280) sheet2.getCell(`G${currentRow}`).value = row.ratio260280;
          if (row.ratio260230) sheet2.getCell(`H${currentRow}`).value = row.ratio260230;
          if (row.dqnRqn) sheet2.getCell(`I${currentRow}`).value = row.dqnRqn;
          if (row.note) sheet2.getCell(`J${currentRow}`).value = row.note;
        });

        console.log(`✅ Sample Sheet 已寫入 ${orderData.sampleInfo.sampleSheet.length} 行`);
      }
      
      if (orderData.sampleInfo && orderData.sampleInfo.runConfig) {
        const config = orderData.sampleInfo.runConfig;
        if (config.sequencer) sheet2.getCell('C24').value = config.sequencer;
        if (config.read1Length) sheet2.getCell('C25').value = config.read1Length;
        if (config.read2Length) sheet2.getCell('C26').value = config.read2Length;
        if (config.phiX) sheet2.getCell('C27').value = config.phiX;
      }
    }
    
    const buffer = await workbook.xlsx.writeBuffer();
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=TGIA_Order_${orderId}.xlsx`);
    res.send(buffer);
    
    console.log(`📥 Excel已匯出（含簽名）: ${orderId}`);
  } catch (error) {
    console.error('❌ 匯出失敗:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 後端服務器運行於 http://0.0.0.0:${PORT}`);
  console.log(`🌐 外部訪問: http://192.168.60.62:${PORT}`);
  console.log(`📁 訂單儲存位置: ${ordersDir}`);
  console.log(`📋 Excel模板位置: ${templatesDir}`);
});