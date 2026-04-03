/**
 * [学校名称] 课表解析器模板
 *
 * 使用方法：
 * 1. 复制此文件为 parsers/your-school.js
 * 2. 实现 parseSchedule() 函数
 * 3. 在 manifest.json 中注册
 *
 * parseSchedule() 必须返回以下格式：
 *
 * 成功：
 * {
 *   success: true,
 *   data: {
 *     semesterName: "2025-2026 第二学期",
 *     startDate: "2026-02-23",        // ISO 8601，开学第一周的周一
 *     totalWeeks: 20,
 *     courses: [
 *       {
 *         title: "课程名称",           // 必填
 *         teacher: "教师名",           // 可为空字符串
 *         location: "上课地点",        // 可为空字符串
 *         note: "备注",               // 可为空字符串
 *         rules: [
 *           {
 *             weekday: 1,              // 1=周一, 2=周二, ..., 7=周日
 *             startSlot: 1,            // 起始节次（从1开始）
 *             endSlot: 2,              // 结束节次
 *             weeks: "1-16"            // 周次规则，支持格式见下方说明
 *           }
 *         ]
 *       }
 *     ],
 *     timeSlots: [                     // 可选，null 则使用 App 默认节次
 *       { index: 1, startTime: "08:00", endTime: "08:45" }
 *     ]
 *   },
 *   error: null
 * }
 *
 * 失败：
 * { success: false, data: null, error: "错误描述" }
 *
 * weeks 字段格式说明（与 App 内 WeekRuleParser 兼容）：
 *   "1-16"              每周（第1-16周）
 *   "1,3,5,7,9"         指定周
 *   "1-8,10-16"         范围组合
 *   "1,3,5,7,9,11,13,15,17,19"  单周
 *   "2,4,6,8,10,12,14,16,18,20"  双周
 */
function parseSchedule() {
    try {
        // TODO: 实现你的解析逻辑

        // 1. 找到课表所在的 DOM 元素
        // var table = document.querySelector("...");

        // 2. 遍历并提取课程数据
        // var courses = [];

        // 3. 返回结果
        return {
            success: false,
            data: null,
            error: "此解析器尚未实现，请参考 zhengfang-generic.js 编写解析逻辑。"
        };

    } catch (e) {
        return { success: false, data: null, error: "解析异常: " + e.message };
    }
}
