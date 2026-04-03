/**
 * 正方教务系统（通用）课表解析器
 *
 * 适用于标准正方教务系统的课表查询页面。
 * 页面 URL 通常包含 /kbcx/xskbcx_cxXskbcxIndex 或 /kbcx/xskbcx_cxXsKb
 *
 * 正方系统的课表页面结构：
 * - 课表以 HTML <table> 渲染，id 通常为 "table1" 或 class 包含 "el-table"
 * - 每一行代表一个时间段（节次），每一列代表一个星期
 * - 每个单元格内可能有多门课程，用 <div> 分隔
 * - 课程信息格式通常为：课程名\n教师\n周次\n地点
 */
function parseSchedule() {
    try {
        // ============================================================
        // 第一步：找到课表表格
        // ============================================================
        // 正方系统通常使用 id="table1" 或特定 class
        var table = document.getElementById("table1");
        if (!table) {
            // 备选：查找页面上最大的表格
            var tables = document.querySelectorAll("table");
            var maxRows = 0;
            for (var i = 0; i < tables.length; i++) {
                var rows = tables[i].querySelectorAll("tr").length;
                if (rows > maxRows) {
                    maxRows = rows;
                    table = tables[i];
                }
            }
        }

        if (!table) {
            return { success: false, data: null, error: "未找到课表表格，请确认已进入课表查询页面。" };
        }

        // ============================================================
        // 第二步：解析学期信息
        // ============================================================
        var semesterName = "导入课表";
        var totalWeeks = 20;

        // 尝试从页面上的学期选择器获取学期名称
        var semesterSelect = document.getElementById("xnxq01id") || document.querySelector("select[name*='xnxq']");
        if (semesterSelect) {
            var selected = semesterSelect.options[semesterSelect.selectedIndex];
            if (selected) {
                semesterName = selected.text || selected.value || semesterName;
            }
        }

        // 尝试从页面文本中提取总周数
        var weekText = document.body.innerText.match(/共\s*(\d+)\s*周/);
        if (weekText) {
            totalWeeks = parseInt(weekText[1]) || totalWeeks;
        }

        // ============================================================
        // 第三步：解析课程数据
        // ============================================================
        var courses = {};  // 按课程名分组
        var rows = table.querySelectorAll("tr");

        for (var rowIdx = 1; rowIdx < rows.length; rowIdx++) {  // 跳过表头
            var cells = rows[rowIdx].querySelectorAll("td");

            for (var colIdx = 0; colIdx < cells.length; colIdx++) {
                var cell = cells[colIdx];
                var weekday = colIdx + 1;  // 1=周一, 2=周二, ...

                // 正方系统每个单元格可能包含多门课程
                var courseBlocks = cell.querySelectorAll("div.kbcontent, div[class*='kbcontent']");
                if (courseBlocks.length === 0) {
                    // 如果没有特定 class，尝试直接解析单元格文本
                    var text = cell.innerText.trim();
                    if (text && text !== "\u00a0") {
                        courseBlocks = [cell];
                    }
                }

                for (var b = 0; b < courseBlocks.length; b++) {
                    var parsed = parseCourseBlock(courseBlocks[b], weekday, rowIdx);
                    if (parsed) {
                        if (!courses[parsed.title]) {
                            courses[parsed.title] = {
                                title: parsed.title,
                                teacher: parsed.teacher,
                                location: parsed.location,
                                note: "",
                                rules: []
                            };
                        }
                        courses[parsed.title].rules.push(parsed.rule);
                    }
                }
            }
        }

        var courseList = Object.values(courses);
        if (courseList.length === 0) {
            return { success: false, data: null, error: "未在表格中解析到任何课程数据。" };
        }

        // ============================================================
        // 第四步：组装返回结果
        // ============================================================
        return {
            success: true,
            data: {
                semesterName: semesterName,
                startDate: guessStartDate(),
                totalWeeks: totalWeeks,
                courses: courseList,
                timeSlots: null  // 正方系统通常不在课表页面展示节次时间
            },
            error: null
        };

    } catch (e) {
        return { success: false, data: null, error: "解析异常: " + e.message };
    }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 解析单个课程块
 * 正方系统课程信息通常格式为：
 *   课程名称
 *   教师名称
 *   1-16周 / 1,3,5周(单) / 2,4,6周(双)
 *   教室地点
 */
function parseCourseBlock(block, weekday, slotRow) {
    var text = block.innerText.trim();
    if (!text || text === "\u00a0" || text.length < 2) return null;

    var lines = text.split(/\n/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
    if (lines.length < 1) return null;

    var title = lines[0];
    var teacher = "";
    var location = "";
    var weeks = "1-20";  // 默认全周

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i];
        // 匹配周次信息：包含"周"字且有数字
        if (/\d.*周/.test(line) || /周.*\d/.test(line)) {
            weeks = parseWeeksText(line);
        }
        // 匹配地点：通常包含楼、室、号等关键字
        else if (/[楼室号栋层区]|[A-Z]\d|教/.test(line)) {
            location = line;
        }
        // 其他可能是教师名（通常较短）
        else if (line.length <= 10 && !teacher) {
            teacher = line;
        }
    }

    return {
        title: title,
        teacher: teacher,
        location: location,
        rule: {
            weekday: weekday,
            startSlot: slotRow,
            endSlot: slotRow,  // 单节，如需连堂需解析 rowspan
            weeks: weeks
        }
    };
}

/**
 * 解析周次文本为 WeekRuleParser 兼容格式
 * 输入示例：
 *   "1-16周"          → "1-16"
 *   "1,3,5,7周(单)"   → "1,3,5,7"
 *   "1-8周,10-16周"   → "1-8,10-16"
 *   "第1-16周"        → "1-16"
 */
function parseWeeksText(text) {
    // 移除"第"、"周"、"(单)"、"(双)"等修饰
    var cleaned = text
        .replace(/第/g, "")
        .replace(/周/g, "")
        .replace(/\(单\)/g, "")
        .replace(/\(双\)/g, "")
        .replace(/（单）/g, "")
        .replace(/（双）/g, "")
        .trim();

    // 提取数字和分隔符
    var matches = cleaned.match(/[\d]+[-,\d]*/g);
    if (matches) {
        return matches.join(",");
    }

    return "1-20";  // fallback
}

/**
 * 猜测开学日期
 * 返回 ISO 格式的日期字符串 (YYYY-MM-DD)
 * 简单策略：根据当前日期推断
 */
function guessStartDate() {
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth() + 1;

    // 2-7月 → 春季学期，大约2月底开学
    if (month >= 2 && month <= 7) {
        return year + "-02-24";
    }
    // 8-1月 → 秋季学期，大约9月初开学
    return year + "-09-01";
}
