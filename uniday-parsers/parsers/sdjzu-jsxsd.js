/**
 * 山东建筑大学 / 强智教务系统 (JSXSD) 课表解析器
 *
 * 适用于强智科技教务系统（湖南强智）的课表查询页面。
 * 页面 URL: /jsxsd/xskb/xskb_list.do
 *
 * 页面结构：
 * - 课表为 <table id="timetable">
 * - 每行是一个"大节"（含多个小节），每列是一个星期
 * - 每个单元格含 div.kbcontent（详细模式，默认 display:none）
 *   内有课程名、<font title='教师'>、<font title='周次(节次)'>、<font title='教室'>
 * - 同一单元格多门课用 "-----" 分隔
 * - 学期选择器: <select name="xnxq01id">
 * - 大节时间在 <th> 中，格式如 "第一大节 (01,02小节) 07:50-09:25"
 */
function parseSchedule() {
    try {
        // ============================================================
        // 第一步：获取学期信息
        // ============================================================
        var semesterName = "";
        var semesterSelect = document.getElementById("xnxq01id");
        if (semesterSelect && semesterSelect.selectedIndex >= 0) {
            semesterName = semesterSelect.options[semesterSelect.selectedIndex].text.trim();
        }
        if (!semesterName) semesterName = "导入课表";

        // 从周次下拉框推断总周数
        var totalWeeks = 20;
        var zcSelect = document.getElementById("zc") || document.querySelector("select[name='zc']");
        if (zcSelect) {
            var maxWeek = 0;
            for (var i = 0; i < zcSelect.options.length; i++) {
                var val = parseInt(zcSelect.options[i].value);
                if (!isNaN(val) && val > maxWeek) maxWeek = val;
            }
            if (maxWeek > 0) totalWeeks = maxWeek;
        }

        // ============================================================
        // 第二步：找到课表表格
        // ============================================================
        var table = document.getElementById("timetable");
        if (!table) {
            return { success: false, data: null, error: "未找到课表表格（id=timetable），请确认已进入学期理论课表页面。" };
        }

        // ============================================================
        // 第三步：解析时间节次信息
        // ============================================================
        var timeSlots = [];
        var rows = table.querySelectorAll("tr");

        // 每行 <th> 包含大节信息，格式：
        // "第一大节 (01,02小节) 07:50-09:25"
        var slotRows = []; // 每行对应的小节范围 [{start, end, startTime, endTime}]
        for (var r = 1; r < rows.length; r++) {
            var th = rows[r].querySelector("th");
            if (!th) continue;
            var thText = th.innerText.trim();

            // 提取小节编号
            var slotMatch = thText.match(/\(([0-9,]+)\s*小节\)/);
            var slots = [];
            if (slotMatch) {
                slots = slotMatch[1].split(",").map(function(s) { return parseInt(s.trim()); }).filter(function(n) { return !isNaN(n); });
            }

            // 提取时间
            var timeMatch = thText.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
            var startTime = timeMatch ? timeMatch[1] : null;
            var endTime = timeMatch ? timeMatch[2] : null;

            slotRows.push({ row: r, slots: slots, startTime: startTime, endTime: endTime });

            // 为每个小节生成时间（45 分钟一节，5 分钟课间）
            if (slots.length > 0 && startTime) {
                var startMinutes = parseTime(startTime);
                var periodLen = 45;
                var breakLen = 5;
                for (var si = 0; si < slots.length; si++) {
                    var slotStart = startMinutes + si * (periodLen + breakLen);
                    var slotEnd = slotStart + periodLen;
                    timeSlots.push({
                        index: slots[si],
                        startTime: formatTime(slotStart),
                        endTime: formatTime(slotEnd)
                    });
                }
            }
        }

        // ============================================================
        // 第四步：解析课程数据
        // ============================================================
        var courses = {}; // 按课程名合并

        for (var ri = 0; ri < slotRows.length; ri++) {
            var rowInfo = slotRows[ri];
            var row = rows[rowInfo.row];
            var tds = row.querySelectorAll("td");

            for (var ci = 0; ci < tds.length && ci < 7; ci++) {
                var weekday = ci + 1;
                var td = tds[ci];

                // 使用 kbcontent 类的详细 div（含教师信息）
                var detailDivs = td.querySelectorAll("div.kbcontent");
                for (var di = 0; di < detailDivs.length; di++) {
                    var div = detailDivs[di];
                    var html = div.innerHTML;
                    if (!html || html.trim() === "&nbsp;" || html.trim() === "") continue;

                    // 同一单元格多门课用 "-----" 分隔
                    var blocks = html.split(/---+(?:<br\/?>)?/);

                    for (var bi = 0; bi < blocks.length; bi++) {
                        var block = blocks[bi].trim();
                        if (!block) continue;

                        var parsed = parseCourseBlock(block, weekday, rowInfo.slots);
                        if (parsed) {
                            var key = parsed.title;
                            if (!courses[key]) {
                                courses[key] = {
                                    title: parsed.title,
                                    teacher: parsed.teacher,
                                    location: parsed.location,
                                    note: "",
                                    rules: []
                                };
                            }
                            // 去重：相同 weekday + slots + weeks 的规则不重复添加
                            var isDuplicate = courses[key].rules.some(function(r) {
                                return r.weekday === parsed.rule.weekday &&
                                       r.startSlot === parsed.rule.startSlot &&
                                       r.endSlot === parsed.rule.endSlot &&
                                       r.weeks === parsed.rule.weeks;
                            });
                            if (!isDuplicate) {
                                courses[key].rules.push(parsed.rule);
                            }
                            // 更新教师和地点（可能不同周次有不同教师）
                            if (parsed.teacher && !courses[key].teacher) {
                                courses[key].teacher = parsed.teacher;
                            }
                        }
                    }
                }
            }
        }

        var courseList = Object.values(courses);
        if (courseList.length === 0) {
            return { success: false, data: null, error: "未在课表中解析到任何课程，请确认当前学期有课程数据。" };
        }

        // ============================================================
        // 第五步：组装返回结果
        // ============================================================
        // 对时间节次排序去重
        timeSlots.sort(function(a, b) { return a.index - b.index; });
        var uniqueSlots = [];
        var seenIndex = {};
        for (var tsi = 0; tsi < timeSlots.length; tsi++) {
            if (!seenIndex[timeSlots[tsi].index]) {
                seenIndex[timeSlots[tsi].index] = true;
                uniqueSlots.push(timeSlots[tsi]);
            }
        }

        return {
            success: true,
            data: {
                semesterName: semesterName,
                startDate: guessStartDate(semesterName),
                totalWeeks: totalWeeks,
                courses: courseList,
                timeSlots: uniqueSlots.length > 0 ? uniqueSlots : null
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
 * 解析单个课程块 HTML
 * 强智系统 kbcontent div 格式：
 *   课程名<br/>
 *   <font title='教师'>教师名</font><br/>
 *   <font title='周次(节次)'>1-16(周)[01-02节]</font><br/>
 *   <font title='教室'>教室名[容量]</font><br/>
 */
function parseCourseBlock(blockHtml, weekday, slotRange) {
    // 创建临时元素解析 HTML
    var temp = document.createElement("div");
    temp.innerHTML = blockHtml;

    // 提取课程名：第一段纯文本（在第一个 <font> 之前）
    // 强智系统有时将副标题放在 <br/> 后的下一行，如：
    //   大学体育4<br/>(乒乓球)<br/><font ...>
    // 需要把副标题也拼入课程名
    var title = "";
    var beforeFont = temp.innerHTML.split(/<font[\s>]/i)[0];
    var titleTemp = document.createElement("div");
    titleTemp.innerHTML = beforeFont;
    title = titleTemp.textContent.trim();
    if (!title) return null;

    // 提取教师
    var teacher = "";
    var teacherFont = temp.querySelector("font[title='教师']");
    if (teacherFont) {
        teacher = teacherFont.textContent.trim();
    }

    // 提取周次节次
    var weeksText = "";
    var slotsFromPage = null;
    var weekFont = temp.querySelector("font[title='周次(节次)']");
    if (weekFont) {
        var weekContent = weekFont.textContent.trim();
        // 格式: "1-16(周)[01-02节]" 或 "1,3,5,7(周)[03-04-05节]"
        var weekMatch = weekContent.match(/^([\d,\-]+)\s*\(周\)/);
        if (weekMatch) {
            weeksText = weekMatch[1];
        }
        // 提取节次
        var slotMatch = weekContent.match(/\[([\d\-]+)节\]/);
        if (slotMatch) {
            var slotParts = slotMatch[1].split("-").map(function(s) { return parseInt(s); });
            if (slotParts.length >= 2) {
                slotsFromPage = { start: slotParts[0], end: slotParts[slotParts.length - 1] };
            } else if (slotParts.length === 1) {
                slotsFromPage = { start: slotParts[0], end: slotParts[0] };
            }
        }
    }

    if (!weeksText) return null;

    // 提取教室
    var location = "";
    var locFont = temp.querySelector("font[title='教室']");
    if (locFont) {
        location = locFont.textContent.trim();
        // 移除容量信息 [媒99] [座H90]
        location = location.replace(/\[.*?\]\s*$/, "").trim();
    }

    // 确定节次范围
    var startSlot, endSlot;
    if (slotsFromPage) {
        startSlot = slotsFromPage.start;
        endSlot = slotsFromPage.end;
    } else if (slotRange && slotRange.length > 0) {
        startSlot = slotRange[0];
        endSlot = slotRange[slotRange.length - 1];
    } else {
        return null;
    }

    return {
        title: title,
        teacher: teacher,
        location: location,
        rule: {
            weekday: weekday,
            startSlot: startSlot,
            endSlot: endSlot,
            weeks: weeksText
        }
    };
}

/**
 * 从学期名推测开学日期
 * 学期名格式: "2025-2026 第二学期"
 */
function guessStartDate(semesterName) {
    var match = semesterName.match(/(\d{4})-(\d{4})\s*第([一二])学期/);
    if (match) {
        var startYear = parseInt(match[1]);
        var endYear = parseInt(match[2]);
        var term = match[3];
        if (term === "一") {
            // 秋季学期，约9月初开学
            return endYear > startYear ? startYear + "-09-01" : startYear + "-09-01";
        } else {
            // 春季学期，约2月底开学
            return endYear + "-02-24";
        }
    }
    // fallback
    var now = new Date();
    var month = now.getMonth() + 1;
    var year = now.getFullYear();
    if (month >= 2 && month <= 7) return year + "-02-24";
    return year + "-09-01";
}

function parseTime(timeStr) {
    var parts = timeStr.split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function formatTime(minutes) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}
